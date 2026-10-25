import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  asRecord,
  parseProvider,
  validateApiUrl,
} from '../src/features/settings/generationSettings.ts';
import { comfyJson } from './comfyui-api.ts';
import {
  catalogChoices,
  deleteWorkflow,
  listWorkflows,
  readWorkflow,
  writeWorkflow,
  type NodeCatalog,
} from './comfyui-workflows.ts';
import {
  beginOperation,
  finishOperation,
  getActiveOperation,
  type GenerationOperation,
} from './generation-operations.ts';
import { getGenerationProvider } from './generation-providers.ts';
import { readGenerationSettings } from './generation-settings.ts';
import { readRequestBody, sendJson } from './http-utils.ts';

export async function handleGenerationConnectionsRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  projectRoot: string
) {
  const route = url.pathname;
  const workflowRoute = route.match(/^\/api\/generation\/workflows(?:\/([^/]+))?$/);
  if (
    !workflowRoute &&
    !['/api/generation/models', '/api/generation/connection/test'].includes(route)
  )
    return false;
  let operation: GenerationOperation | undefined;
  try {
    if (workflowRoute) {
      const id = workflowRoute[1];
      if (req.method === 'GET') {
        sendJson(
          res,
          200,
          id ? await readWorkflow(projectRoot, id) : await listWorkflows(projectRoot)
        );
        return true;
      }
      if (
        (req.method === 'POST' && !id) ||
        (req.method === 'PUT' && id) ||
        (req.method === 'DELETE' && id)
      ) {
        if (getActiveOperation()) {
          sendJson(res, 409, {
            message:
              'Workflows cannot be changed during generation or another configuration operation.',
          });
          return true;
        }
        operation = beginOperation('configuration');
        if (id === 'builtin-txt2img') throw new Error('The bundled workflow is read-only.');
        if (req.method === 'DELETE') {
          const settings = await readGenerationSettings(projectRoot);
          if (settings.profiles.comfyui.workflowId === id)
            throw new Error('Select and save another workflow before deleting this preset.');
          await deleteWorkflow(projectRoot, id!);
          sendJson(res, 200, { ok: true });
        } else {
          const payload = await readRequestBody(req, { maxBytes: 2 * 1024 * 1024 });
          sendJson(res, 200, await writeWorkflow(projectRoot, payload, id));
        }
        return true;
      }
    } else if (
      (route.endsWith('/models') && req.method === 'GET') ||
      (route.endsWith('/test') && req.method === 'POST')
    ) {
      const body = route.endsWith('/test')
        ? asRecord(await readRequestBody(req, { maxBytes: 16_384 }))
        : {};
      const providerId = parseProvider(body.provider ?? url.searchParams.get('provider'));
      const apiUrl = validateApiUrl(String(body.apiUrl ?? url.searchParams.get('baseUrl') ?? ''));
      const signal = AbortSignal.timeout(15_000);
      if (providerId === 'comfyui' && route.endsWith('/test'))
        await comfyJson(apiUrl, '/system_stats', signal);
      let models;
      const workflowId = url.searchParams.get('workflowId');
      if (providerId === 'comfyui' && workflowId && workflowId !== 'builtin-txt2img') {
        const workflow = await readWorkflow(projectRoot, workflowId);
        const catalog = (await comfyJson(apiUrl, '/object_info', signal)) as NodeCatalog;
        const choices = (workflow.bindings.model ?? []).map((binding) =>
          catalogChoices(catalog, workflow.graph[binding.nodeId].class_type, binding.input)
        );
        models = (choices[0] ?? [])
          .filter((id) => choices.every((options) => options.includes(id)))
          .map((id) => ({ id, label: id }));
      } else models = await getGenerationProvider(providerId).listModels(apiUrl, signal);
      sendJson(
        res,
        200,
        route.endsWith('/test') ? { provider: providerId, models, ok: true } : models
      );
      return true;
    }
    res.setHeader(
      'Allow',
      workflowRoute ? 'GET, POST, PUT, DELETE' : route.endsWith('/models') ? 'GET' : 'POST'
    );
    sendJson(res, 405, { message: 'Method not allowed.' });
  } catch (error) {
    sendJson(res, 400, {
      message: error instanceof Error ? error.message : 'Connection or workflow request failed.',
    });
  } finally {
    if (operation) finishOperation(operation);
  }
  return true;
}
