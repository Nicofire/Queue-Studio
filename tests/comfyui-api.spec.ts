import { expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type RequestListener, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { comfyuiProvider } from '../dev-server/comfyui-api';
import {
  compileWorkflow,
  deleteWorkflow,
  listWorkflows,
  readWorkflow,
  writeWorkflow,
  type NodeCatalog,
} from '../dev-server/comfyui-workflows';
import {
  inferWorkflowBindings,
  parseWorkflowPreset,
} from '../src/features/generation/comfyWorkflow';
import { DEFAULT_GENERATION_SETTINGS } from '../src/features/settings/generationSettings';

const settings = DEFAULT_GENERATION_SETTINGS.profiles.comfyui;
const input = {
  prompt: 'portrait',
  negativePrompt: 'blur',
  model: 'model.safetensors',
  seed: 42,
};

async function fixture() {
  const preset = await readWorkflow(process.cwd(), 'builtin-txt2img');
  const catalog: NodeCatalog = Object.fromEntries(
    Object.values(preset.graph).map((node) => [node.class_type, { input: { required: {} } }])
  );
  catalog.CheckpointLoaderSimple.input!.required = { ckpt_name: [['model.safetensors']] };
  catalog.LoraLoader = {
    input: {
      required: {
        lora_name: [['folder/portrait.safetensors']],
        strength_model: ['FLOAT', { min: -10, max: 10 }],
      },
    },
  };
  catalog.PreviewImage.output_node = true;
  return { preset, catalog };
}

test('standard ComfyUI workflow compiles prompts, overrides, seed and preview batch without mutating its template', async () => {
  const { preset, catalog } = await fixture();
  const graph = compileWorkflow(preset, settings, input, 9, catalog);
  expect(graph['3'].inputs.seed).toBe(42);
  expect(graph['4'].inputs.ckpt_name).toBe('model.safetensors');
  expect(graph['5'].inputs.batch_size).toBe(9);
  expect(graph['6'].inputs.text).toBe('portrait');
  expect(preset.graph['5'].inputs.batch_size).toBe(1);
  expect(inferWorkflowBindings(preset.graph)).toEqual(preset.bindings);
});

test('standard workflow translates LoRA tags into linked nodes and rejects missing assets', async () => {
  const { preset, catalog } = await fixture();
  const graph = compileWorkflow(
    preset,
    settings,
    { ...input, prompt: 'portrait, <lora:portrait:0.7>' },
    1,
    catalog
  );
  expect(graph['qs-lora-0'].inputs).toMatchObject({
    lora_name: 'folder/portrait.safetensors',
    strength_model: 0.7,
  });
  expect(graph['3'].inputs.model).toEqual(['qs-lora-0', 0]);
  expect(graph['6'].inputs.clip).toEqual(['qs-lora-0', 1]);
  expect(graph['6'].inputs.text).toBe('portrait');
  expect(() =>
    compileWorkflow(preset, settings, { ...input, model: 'missing' }, 1, catalog)
  ).toThrow('unavailable');
  expect(() =>
    compileWorkflow(preset, settings, { ...input, prompt: '<lora:missing:1>' }, 1, catalog)
  ).toThrow('missing');
});

test('custom workflows require valid explicit bindings, outputs and supported overrides', async () => {
  const { preset, catalog } = await fixture();
  const custom = parseWorkflowPreset({ ...preset, bindings: {} }, 'custom');
  expect(() => compileWorkflow(custom, settings, { ...input, model: '' }, 4, catalog)).toThrow(
    'batch-size'
  );
  expect(() => compileWorkflow(custom, settings, input, 1, catalog)).toThrow('model binding');
  expect(() =>
    compileWorkflow(
      { ...preset, builtin: false },
      settings,
      { ...input, prompt: '<lora:portrait:1>' },
      1,
      catalog
    )
  ).toThrow('standard workflow');
  expect(() => parseWorkflowPreset({ nodes: [], links: [] }, 'custom')).toThrow('API workflow');
  expect(() => parseWorkflowPreset({ ...preset, outputNodeIds: ['missing'] }, 'custom')).toThrow(
    'output'
  );
  expect(() =>
    parseWorkflowPreset(
      { ...preset, bindings: { seed: [{ nodeId: '3', input: 'model' }] } },
      'custom'
    )
  ).toThrow('literal');
  expect(() =>
    parseWorkflowPreset(
      { ...preset, bindings: { seed: [{ nodeId: '6', input: 'text' }] } },
      'custom'
    )
  ).toThrow('number');
  expect(() =>
    parseWorkflowPreset(
      {
        ...preset,
        bindings: {
          positivePrompt: [{ nodeId: '6', input: 'text' }],
          negativePrompt: [{ nodeId: '6', input: 'text' }],
        },
      },
      'custom'
    )
  ).toThrow('more than once');
});

test('workflow presets use server-generated IDs and safe atomic persistence', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'comfy-workflows-'));
  try {
    const { preset } = await fixture();
    const saved = await writeWorkflow(directory, { ...preset, name: 'My workflow' });
    expect(saved.builtin).toBe(false);
    expect((await listWorkflows(directory)).map((entry) => entry.id)).toEqual([
      'builtin-txt2img',
      saved.id,
    ]);
    expect((await readWorkflow(directory, saved.id)).name).toBe('My workflow');
    await expect(readWorkflow(directory, '../settings')).rejects.toThrow('ID');
    await expect(writeWorkflow(directory, preset, 'builtin-txt2img')).rejects.toThrow('ID');
    await deleteWorkflow(directory, saved.id);
    expect(await listWorkflows(directory)).toHaveLength(1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function fakeComfy(handler: RequestListener) {
  const server: Server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

for (const batchSize of [1, 4, 9]) {
  test(`ComfyUI submits once and downloads its selected ${batchSize} PNG outputs`, async () => {
    const { preset: workflow, catalog } = await fixture();
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=';
    let submissions = 0;
    let polls = 0;
    const remote = await fakeComfy((request, response) => {
      const url = new URL(request.url!, 'http://localhost');
      request.resume();
      if (url.pathname === '/prompt') {
        submissions += 1;
        response.end(JSON.stringify({ prompt_id: 'own-prompt' }));
      } else if (url.pathname === '/history/own-prompt') {
        polls += 1;
        response.end(
          JSON.stringify(
            polls === 1
              ? {}
              : {
                  'own-prompt': {
                    status: { completed: true, status_str: 'success' },
                    outputs: {
                      '9': {
                        images: Array.from({ length: batchSize }, () => ({
                          filename: 'own.png',
                          subfolder: '',
                          type: 'temp',
                        })),
                      },
                      unrelated: { images: [{ filename: 'other.png' }] },
                    },
                  },
                }
          )
        );
      } else if (url.pathname === '/view' && url.searchParams.get('filename') === 'own.png') {
        response.end(Buffer.from(png, 'base64'));
      } else response.writeHead(404).end();
    });
    try {
      const images = await comfyuiProvider.generate(
        { ...settings, apiUrl: remote.url },
        input,
        batchSize,
        AbortSignal.timeout(5000),
        { workflow, catalog }
      );
      expect(images).toEqual(Array(batchSize).fill(png));
      expect(submissions).toBe(1);
      expect(polls).toBe(2);
    } finally {
      await remote.close();
    }
  });
}

for (const scenario of [
  'node-error',
  'execution-error',
  'non-png',
  'oversized-image',
  'foreign-history',
] as const) {
  test(`ComfyUI rejects ${scenario} without retrying submission`, async () => {
    const { preset: workflow, catalog } = await fixture();
    let submissions = 0;
    let downloads = 0;
    const remote = await fakeComfy((request, response) => {
      request.resume();
      if (request.url === '/prompt') {
        submissions += 1;
        response.end(
          JSON.stringify(
            scenario === 'node-error'
              ? { node_errors: { '4': { message: 'Missing model' } } }
              : { prompt_id: 'own' }
          )
        );
      } else if (request.url === '/history/own') {
        const entry =
          scenario === 'execution-error'
            ? {
                status: {
                  completed: false,
                  status_str: 'error',
                  messages: [['execution_error', { exception_message: 'Out of memory' }]],
                },
              }
            : {
                status: { completed: true, status_str: 'success' },
                outputs: { '9': { images: [{ filename: 'bad.png', type: 'temp' }] } },
              };
        response.end(
          JSON.stringify({ [scenario === 'foreign-history' ? 'someone-else' : 'own']: entry })
        );
      } else if (request.url?.startsWith('/view?')) {
        downloads += 1;
        if (scenario === 'oversized-image') response.setHeader('Content-Length', 33 * 1024 * 1024);
        response.end('not PNG');
      } else if (request.url === '/api/jobs/own/cancel') response.end('{}');
      else response.writeHead(404).end('{}');
    });
    try {
      const expected = {
        'node-error': 'rejected',
        'execution-error': 'execution failed',
        'non-png': 'PNG',
        'oversized-image': 'size',
        'foreign-history': '',
      }[scenario];
      await expect(
        comfyuiProvider.generate(
          { ...settings, apiUrl: remote.url },
          input,
          1,
          AbortSignal.timeout(1000),
          { workflow, catalog }
        )
      ).rejects.toThrow(expected);
      expect(submissions).toBe(1);
      expect(downloads).toBe(['non-png', 'oversized-image'].includes(scenario) ? 1 : 0);
    } finally {
      await remote.close();
    }
  });
}

for (const legacy of [false, true]) {
  test(`ComfyUI abort only cancels its own job (${legacy ? 'legacy queue' : 'job-specific API'})`, async () => {
    const { preset: workflow, catalog } = await fixture();
    const controller = new AbortController();
    const paths: string[] = [];
    let warning = '';
    const remote = await fakeComfy((request, response) => {
      const endpoint = request.url!;
      paths.push(endpoint);
      request.resume();
      if (endpoint === '/prompt') response.end(JSON.stringify({ prompt_id: 'owned' }));
      else if (endpoint === '/history/owned') {
        response.end('{}');
        controller.abort();
      } else if (endpoint === '/api/jobs/owned/cancel')
        response.writeHead(legacy ? 404 : 200).end('{}');
      else if (endpoint === '/queue') response.end('{}');
      else response.writeHead(500).end('{}');
    });
    try {
      await expect(
        comfyuiProvider.generate({ ...settings, apiUrl: remote.url }, input, 1, controller.signal, {
          workflow,
          catalog,
          onCancellation: (message) => {
            warning = message;
          },
        })
      ).rejects.toThrow();
      expect(paths).toContain('/api/jobs/owned/cancel');
      expect(paths.includes('/queue')).toBe(legacy);
      expect(paths.some((endpoint) => endpoint.includes('interrupt'))).toBe(false);
      expect(warning).toContain(legacy ? 'may continue' : 'cancellation requested');
    } finally {
      await remote.close();
    }
  });
}
