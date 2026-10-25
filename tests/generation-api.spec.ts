import { expect, test } from '@playwright/test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readWorkflow, type NodeCatalog } from '../dev-server/comfyui-workflows';
import { handleConfigFilesRequest } from '../dev-server/config-files-api';
import { handleGenerationRequest } from '../dev-server/generation-api';
import { handleGenerationConnectionsRequest } from '../dev-server/generation-connections-api';
import type { GenerationStatusResponse } from '../src/features/generation/generationApi';
import {
  DEFAULT_GENERATION_SETTINGS,
  toPersistedGenerationSettings,
} from '../src/features/settings/generationSettings';

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('generation API statistics measure saved images and reset independently of failures', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'queue-statistics-'));
  const imageRequests: ServerResponse[] = [];
  const imageApi = createServer((request, response) => {
    request.resume();
    imageRequests.push(response);
  });
  const queueApi = createServer((request, response) => {
    void handleGenerationRequest(
      request,
      response,
      new URL(request.url!, 'http://localhost'),
      projectRoot
    ).catch((error) => {
      response.writeHead(500).end(String(error));
    });
  });
  const imageUrl = await listen(imageApi);
  const queueUrl = await listen(queueApi);
  async function call(endpoint: string, body?: unknown): Promise<GenerationStatusResponse> {
    const response = await fetch(
      `${queueUrl}/api/generation/${endpoint}`,
      body === undefined
        ? undefined
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
    );
    expect(response.ok).toBe(true);
    return (await response.json()) as GenerationStatusResponse;
  }

  try {
    await mkdir(path.join(projectRoot, 'data'));
    await writeFile(
      path.join(projectRoot, 'data', 'settings.json'),
      JSON.stringify({ connection: { apiUrl: imageUrl } })
    );
    const items = [1, 2].map((index) => ({
      id: `test-${index}`,
      summary: `Landscape ${index}`,
      prompt: 'landscape',
      negativePrompt: '',
    }));
    await call('queue/add', { items });
    const started = await call('start', {});
    expect(started.statistics?.averageSecondsPerImage).toBeNull();
    await expect.poll(() => imageRequests.length).toBe(1);
    await call('pause', {});
    const image =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=';
    imageRequests[0]
      .writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ images: [image, image] }));
    await expect.poll(async () => (await call('status')).statistics?.generatedImages).toBe(2);
    const paused = await call('status');
    expect(paused.status).toBe('paused');
    expect(paused.statistics?.averageSecondsPerImage).toBeGreaterThan(0);
    expect(paused.statistics?.estimatedRemainingSeconds).toBeGreaterThan(0);
    expect(paused.statistics?.activeJobSeconds).toBeNull();
    const resumed = await call('start', {});
    expect(resumed.statistics?.generatedImages).toBe(2);
    await expect.poll(() => imageRequests.length).toBe(2);
    imageRequests[1]
      .writeHead(503, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ message: 'Simulated failure' }));
    await expect.poll(async () => (await call('status')).status).toBe('completed');
    const completed = await call('status');
    expect(completed.runCompleted).toBe(2);
    expect(completed.lastError).toBe('Simulated failure');
    expect(completed.statistics).toMatchObject({
      generatedImages: 2,
      averageSecondsPerImage: paused.statistics?.averageSecondsPerImage,
      estimatedRemainingSeconds: 0,
    });
    const files = await readdir(path.join(projectRoot, 'output'), { recursive: true });
    expect(files.filter((file) => file.endsWith('.png'))).toHaveLength(2);
    const cleared = await call('queue/clear', {});
    expect(cleared.statistics).toMatchObject({
      generatedImages: 0,
      averageSecondsPerImage: null,
      estimatedRemainingSeconds: null,
    });
    await call('queue/add', { items: [items[0]] });
    await call('start', {});
    await expect.poll(() => imageRequests.length).toBe(3);
    const aborted = await call('abort', {});
    expect(aborted.statistics).toMatchObject({
      generatedImages: 0,
      activeJobSeconds: null,
      estimatedRemainingSeconds: null,
    });
  } finally {
    await fetch(`${queueUrl}/api/generation/abort`, { method: 'POST' }).catch(() => {});
    for (const response of imageRequests) response.destroy();
    for (const server of [queueApi, imageApi]) server.closeAllConnections();
    await Promise.all(
      [queueApi, imageApi].map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve()))
          )
      )
    );
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('ComfyUI preflight preserves queued jobs, locks configuration and uses a frozen run snapshot', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'queue-comfy-'));
  const preset = await readWorkflow(projectRoot, 'builtin-txt2img');
  const catalog: NodeCatalog = Object.fromEntries(
    Object.values(preset.graph).map((node) => [node.class_type, { input: { required: {} } }])
  );
  catalog.CheckpointLoaderSimple.input!.required = { ckpt_name: [['model.safetensors']] };
  catalog.PreviewImage.output_node = true;
  const submitted: Array<Record<string, { inputs: Record<string, unknown> }>> = [];
  let finish = false;
  let holdMetadata = false;
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=';
  const remote = createServer((request, response) => {
    const endpoint = request.url!;
    let raw = '';
    request.on('data', (chunk) => {
      raw += String(chunk);
    });
    request.on('end', () => {
      if (endpoint.startsWith('/object_info')) {
        if (!holdMetadata) response.end(JSON.stringify(catalog));
      } else if (endpoint === '/system_stats') response.end(JSON.stringify({ devices: [] }));
      else if (endpoint === '/prompt') {
        const body = JSON.parse(raw) as { prompt: (typeof submitted)[number] };
        submitted.push(body.prompt);
        response.end(JSON.stringify({ prompt_id: `job-${submitted.length}` }));
      } else if (endpoint.startsWith('/history/')) {
        const id = endpoint.split('/').pop()!;
        response.end(
          JSON.stringify(
            finish
              ? {
                  [id]: {
                    status: { completed: true, status_str: 'success' },
                    outputs: { '9': { images: [{ filename: 'image.png', type: 'temp' }] } },
                  },
                }
              : {}
          )
        );
      } else if (endpoint.startsWith('/view?')) response.end(Buffer.from(png, 'base64'));
      else response.writeHead(404).end('{}');
    });
  });
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url!, 'http://localhost');
      if (await handleGenerationConnectionsRequest(request, response, url, projectRoot)) return;
      if (await handleConfigFilesRequest(request, response, url.pathname, projectRoot)) return;
      await handleGenerationRequest(request, response, url, projectRoot);
    })().catch((error) => {
      response.writeHead(500).end(String(error));
    });
  });
  const apiUrl = await listen(remote);
  const local = await listen(server);
  const settings = structuredClone(DEFAULT_GENERATION_SETTINGS);
  settings.provider = 'comfyui';
  settings.profiles.comfyui = { ...settings.profiles.comfyui, apiUrl, model: 'missing' };
  const call = (endpoint: string, body?: unknown) =>
    fetch(
      `${local}/api/${endpoint}`,
      body === undefined
        ? undefined
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
    );
  const status = async () =>
    (await (await call('generation/status')).json()) as GenerationStatusResponse;
  try {
    await mkdir(path.join(projectRoot, 'data'));
    await writeFile(
      path.join(projectRoot, 'data', 'settings.json'),
      JSON.stringify(toPersistedGenerationSettings(settings))
    );
    const discovered = await call(
      `generation/models?provider=comfyui&baseUrl=${encodeURIComponent(apiUrl)}`
    );
    expect(await discovered.json()).toEqual([
      { id: 'model.safetensors', label: 'model.safetensors' },
    ]);
    const connection = await call('generation/connection/test', {
      provider: 'comfyui',
      apiUrl,
    });
    expect(await connection.json()).toMatchObject({ ok: true, provider: 'comfyui' });
    const created = await call('generation/workflows', {
      ...preset,
      name: 'Imported workflow',
    });
    expect(created.ok).toBe(true);
    const custom = (await created.json()) as typeof preset;
    expect(custom.builtin).toBe(false);
    const updated = await fetch(`${local}/api/generation/workflows/${custom.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...custom, name: 'Updated workflow' }),
    });
    expect(updated.ok).toBe(true);
    const customModels = await call(
      `generation/models?provider=comfyui&baseUrl=${encodeURIComponent(apiUrl)}&workflowId=${custom.id}`
    );
    expect(await customModels.json()).toEqual([
      { id: 'model.safetensors', label: 'model.safetensors' },
    ]);
    settings.profiles.comfyui.workflowId = custom.id;
    expect((await call('config/settings', toPersistedGenerationSettings(settings))).ok).toBe(true);
    expect(
      (await fetch(`${local}/api/generation/workflows/${custom.id}`, { method: 'DELETE' })).status
    ).toBe(400);
    expect(
      (await fetch(`${local}/api/generation/workflows/builtin-txt2img`, { method: 'DELETE' }))
        .status
    ).toBe(400);
    settings.profiles.comfyui.workflowId = 'builtin-txt2img';
    expect((await call('config/settings', toPersistedGenerationSettings(settings))).ok).toBe(true);
    expect(
      (await fetch(`${local}/api/generation/workflows/${custom.id}`, { method: 'DELETE' })).ok
    ).toBe(true);
    const items = [1, 2].map((id) => ({
      id: String(id),
      summary: 'Comfy job',
      prompt: 'portrait',
      negativePrompt: '',
    }));
    expect((await call('generation/queue/add', { items })).ok).toBe(true);
    expect((await call('generation/start', {})).status).toBe(400);
    expect((await status()).queueLength).toBe(2);
    expect(submitted).toHaveLength(0);
    settings.profiles.comfyui.model = 'model.safetensors';
    expect((await call('config/settings', toPersistedGenerationSettings(settings))).ok).toBe(true);
    const unsaved = structuredClone(settings);
    unsaved.provider = 'automatic1111';
    expect(
      (
        await call('generation/start', {
          expectedConnection: toPersistedGenerationSettings(unsaved).connection,
        })
      ).status
    ).toBe(409);
    expect((await status()).queueLength).toBe(2);
    holdMetadata = true;
    const preview = call('generation/preview', { positive_prompt: 'portrait' });
    await expect.poll(async () => (await status()).operation).toBe('preview');
    expect((await call('generation/preview', { positive_prompt: 'another' })).status).toBe(409);
    expect((await call('generation/start', {})).status).toBe(409);
    expect((await call('config/settings', toPersistedGenerationSettings(unsaved))).status).toBe(
      409
    );
    expect((await call('generation/abort', {})).ok).toBe(true);
    expect((await preview).status).toBe(502);
    expect((await status()).queueLength).toBe(2);
    expect((await status()).isBusy).toBe(false);
    expect(submitted).toHaveLength(0);
    holdMetadata = false;
    expect((await call('generation/start', {})).ok).toBe(true);
    await expect.poll(() => submitted.length).toBe(1);
    expect((await call('generation/preview', { positive_prompt: 'portrait' })).status).toBe(409);
    expect((await call('generation/workflows', preset)).status).toBe(409);
    expect((await call('config/settings', toPersistedGenerationSettings(unsaved))).status).toBe(
      409
    );
    settings.theme = 'dark';
    expect((await call('config/settings', toPersistedGenerationSettings(settings))).ok).toBe(true);
    expect((await call('generation/pause', {})).ok).toBe(true);
    finish = true;
    await expect.poll(async () => (await status()).statistics?.generatedImages).toBe(1);
    settings.profiles.comfyui.steps = 99;
    await writeFile(
      path.join(projectRoot, 'data', 'settings.json'),
      JSON.stringify(toPersistedGenerationSettings(settings))
    );
    expect((await call('generation/start', {})).ok).toBe(true);
    await expect.poll(async () => (await status()).status).toBe('completed');
    expect(submitted[1]['3'].inputs.steps).toBe(30);
    expect((await status()).statistics?.generatedImages).toBe(2);
    const files = await readdir(path.join(projectRoot, 'output'), { recursive: true });
    expect(files.filter((file) => file.endsWith('.png'))).toHaveLength(2);
  } finally {
    await call('generation/abort', {});
    for (const instance of [server, remote]) instance.closeAllConnections();
    await Promise.all(
      [server, remote].map(
        (instance) => new Promise<void>((resolve) => instance.close(() => resolve()))
      )
    );
    await rm(projectRoot, { recursive: true, force: true });
  }
});
