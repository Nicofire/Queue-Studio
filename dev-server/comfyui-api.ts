import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { asRecord, validateApiUrl } from '../src/features/settings/generationSettings.ts';
import {
  catalogChoices,
  compileWorkflow,
  readWorkflow,
  type NodeCatalog,
} from './comfyui-workflows.ts';
import type { GenerationProvider } from './generation-provider.ts';
import { readResponseBytes as boundedBytes } from './http-utils.ts';

const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_BATCH_BYTES = 128 * 1024 * 1024;
const MAX_JSON_BYTES = 16 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

async function comfyRequest(apiUrl: string, endpoint: string, signal: AbortSignal, body?: unknown) {
  const response = await fetch(`${validateApiUrl(apiUrl)}${endpoint}`, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    redirect: 'error',
  });
  return response;
}

export async function comfyJson(
  apiUrl: string,
  endpoint: string,
  signal: AbortSignal,
  body?: unknown
): Promise<unknown> {
  const response = await comfyRequest(apiUrl, endpoint, signal, body);
  const bytes = await boundedBytes(response, MAX_JSON_BYTES);
  let result: unknown;
  try {
    result = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(`ComfyUI returned invalid JSON (${response.status}).`);
  }
  if (!response.ok) {
    const error = asRecord(result);
    throw new Error(
      `ComfyUI request failed (${response.status}): ${JSON.stringify(error.error ?? error.message ?? result).slice(0, 1500)}`
    );
  }
  return result;
}

export async function cancelComfyJob(apiUrl: string, promptId: string) {
  const signal = AbortSignal.timeout(8000);
  try {
    const response = await comfyRequest(
      apiUrl,
      `/api/jobs/${encodeURIComponent(promptId)}/cancel`,
      signal,
      {}
    );
    if (response.ok) {
      await response.body?.cancel();
      return 'ComfyUI job cancellation requested.';
    }
    const legacy = response.status === 404 || response.status === 405;
    await response.body?.cancel();
    if (!legacy) return 'Local generation stopped; ComfyUI did not confirm remote cancellation.';
    await comfyJson(apiUrl, '/queue', signal, { delete: [promptId] });
    return 'Local generation stopped. This ComfyUI version can remove pending jobs only; an already-running job may continue remotely.';
  } catch {
    return 'Local generation stopped; remote cancellation could not be confirmed and the ComfyUI job may continue.';
  }
}

export const comfyuiProvider: GenerationProvider = {
  id: 'comfyui',
  async listModels(apiUrl, signal) {
    const catalog = (await comfyJson(
      apiUrl,
      '/object_info/CheckpointLoaderSimple',
      signal
    )) as NodeCatalog;
    return catalogChoices(catalog, 'CheckpointLoaderSimple', 'ckpt_name').map((id) => ({
      id,
      label: id,
    }));
  },
  async prepare(settings, projectRoot, inputs, batchSize, signal) {
    const workflow = await readWorkflow(projectRoot, settings.workflowId || 'builtin-txt2img');
    const catalog = (await comfyJson(settings.apiUrl, '/object_info', signal)) as NodeCatalog;
    for (const input of inputs) compileWorkflow(workflow, settings, input, batchSize, catalog);
    signal.throwIfAborted();
    return { workflow, catalog };
  },
  async generate(settings, input, batchSize, signal, context) {
    if (!context?.workflow || !context.catalog)
      throw new Error('ComfyUI workflow preflight is required.');
    const graph = compileWorkflow(context.workflow, settings, input, batchSize, context.catalog);
    let promptId: string | undefined;
    try {
      signal.throwIfAborted();
      const submitted = asRecord(
        await comfyJson(settings.apiUrl, '/prompt', signal, {
          prompt: graph,
          client_id: randomUUID(),
        })
      );
      if (typeof submitted.prompt_id === 'string' && submitted.prompt_id)
        promptId = submitted.prompt_id;
      if (
        typeof submitted.prompt_id !== 'string' ||
        !submitted.prompt_id ||
        submitted.error ||
        Object.keys(asRecord(submitted.node_errors)).length
      ) {
        if (promptId) context.onCancellation?.(await cancelComfyJob(settings.apiUrl, promptId));
        throw new Error(
          `ComfyUI rejected the workflow: ${JSON.stringify(submitted).slice(0, 1500)}`
        );
      }
      promptId = submitted.prompt_id;
      while (true) {
        signal.throwIfAborted();
        const history = asRecord(
          await comfyJson(settings.apiUrl, `/history/${encodeURIComponent(promptId)}`, signal)
        );
        const entry = asRecord(history[promptId]);
        const status = asRecord(entry.status);
        const messages = Array.isArray(status.messages) ? status.messages : [];
        const failure = messages.find(
          (message) =>
            Array.isArray(message) &&
            ['execution_error', 'execution_interrupted'].includes(String(message[0]))
        );
        if (status.status_str === 'error' || failure) {
          throw new Error(
            `ComfyUI execution failed: ${JSON.stringify(failure ?? status).slice(0, 1500)}`
          );
        }
        if (status.completed === true && status.status_str === 'success') {
          const outputs = asRecord(entry.outputs);
          const images: string[] = [];
          let totalBytes = 0;
          for (const nodeId of context.workflow.outputNodeIds) {
            const output = asRecord(outputs[nodeId]);
            if (!Array.isArray(output.images))
              throw new Error(`Selected ComfyUI output ${nodeId} contains no images.`);
            for (const rawImage of output.images) {
              const image = asRecord(rawImage);
              if (
                images.length >= 16 ||
                typeof image.filename !== 'string' ||
                !['output', 'temp'].includes(String(image.type)) ||
                (image.subfolder !== undefined && typeof image.subfolder !== 'string')
              ) {
                throw new Error(
                  'Unsupported ComfyUI image output. Select PNG image output nodes only (maximum 16 images).'
                );
              }
              const query = new URLSearchParams({
                filename: image.filename,
                subfolder: String(image.subfolder ?? ''),
                type: String(image.type),
              });
              const response = await comfyRequest(settings.apiUrl, `/view?${query}`, signal);
              if (!response.ok) {
                await response.body?.cancel();
                throw new Error(`ComfyUI image download failed (${response.status}).`);
              }
              const bytes = await boundedBytes(
                response,
                Math.min(MAX_IMAGE_BYTES, MAX_BATCH_BYTES - totalBytes)
              );
              totalBytes += bytes.length;
              if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE))
                throw new Error('ComfyUI output is not a supported PNG image.');
              images.push(bytes.toString('base64'));
            }
          }
          if (images.length !== batchSize)
            throw new Error(
              `Workflow returned ${images.length} images; expected ${batchSize}. Check output nodes and batch binding.`
            );
          signal.throwIfAborted();
          return images;
        }
        await delay(750, undefined, { signal });
      }
    } finally {
      if (signal.aborted) {
        if (promptId) context.onCancellation?.(await cancelComfyJob(settings.apiUrl, promptId));
        else
          context.onCancellation?.(
            'Local generation stopped before a prompt ID was received; remote submission could not be confirmed.'
          );
      }
    }
  },
};
