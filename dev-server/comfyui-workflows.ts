import { randomInt, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  parseWorkflowPreset,
  type WorkflowGraph,
  type WorkflowPreset,
  type WorkflowField,
} from '../src/features/generation/comfyWorkflow.ts';
import { asRecord } from '../src/features/settings/generationSettings.ts';
import type { GenerationInput, GenerationParameters } from './generation-provider.ts';

export type NodeCatalog = Record<
  string,
  {
    input?: { required?: Record<string, unknown[]>; optional?: Record<string, unknown[]> };
    output_node?: boolean;
  }
>;

function workflowPath(projectRoot: string, id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    throw new Error('Invalid workflow ID.');
  }
  return path.resolve(projectRoot, 'data', 'comfyui-workflows', `${id}.json`);
}

export async function readWorkflow(projectRoot: string, id: string): Promise<WorkflowPreset> {
  const filename =
    id === 'builtin-txt2img'
      ? new URL('./workflows/basic-txt2img.json', import.meta.url)
      : workflowPath(projectRoot, id);
  const value: unknown = JSON.parse(await readFile(filename, 'utf8'));
  return parseWorkflowPreset(value, id, id === 'builtin-txt2img');
}

export async function listWorkflows(projectRoot: string) {
  const builtin = await readWorkflow(projectRoot, 'builtin-txt2img');
  const directory = path.resolve(projectRoot, 'data', 'comfyui-workflows');
  await mkdir(directory, { recursive: true });
  const files = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  const presets = await Promise.all(
    files.map((name) => readWorkflow(projectRoot, name.slice(0, -5)))
  );
  return [builtin, ...presets];
}

export async function writeWorkflow(projectRoot: string, value: unknown, existingId?: string) {
  const id = existingId ?? randomUUID();
  if (existingId) await readWorkflow(projectRoot, existingId);
  const preset = parseWorkflowPreset(value, id);
  const filename = workflowPath(projectRoot, id);
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(preset, null, 2)}\n`, { flag: 'wx' });
    await rename(temporary, filename);
  } finally {
    await rm(temporary, { force: true });
  }
  return preset;
}

export async function deleteWorkflow(projectRoot: string, id: string) {
  await rm(workflowPath(projectRoot, id));
}

export function catalogChoices(
  catalog: NodeCatalog,
  className: string,
  input: string
): string[] {
  const node = catalog[className];
  const spec = node?.input?.required?.[input] ?? node?.input?.optional?.[input];
  return Array.isArray(spec?.[0])
    ? spec[0].filter((value): value is string => typeof value === 'string')
    : [];
}

function resolveLora(name: string, choices: string[]) {
  if (choices.includes(name)) return name;
  const shortName = (value: string) =>
    value
      .replace(/\\/g, '/')
      .split('/')
      .pop()!
      .replace(/\.(safetensors|ckpt|pt)$/i, '');
  const matches = choices.filter((choice) => shortName(choice) === shortName(name));
  if (matches.length !== 1)
    throw new Error(`LoRA "${name}" is missing or ambiguous in ComfyUI.`);
  return matches[0];
}

export function compileWorkflow(
  preset: WorkflowPreset,
  settings: GenerationParameters,
  input: GenerationInput,
  batchSize: number,
  catalog: NodeCatalog
): WorkflowGraph {
  const graph = structuredClone(preset.graph);
  if (batchSize > 1 && !preset.bindings.batchSize?.length) {
    throw new Error(
      'This workflow has no batch-size binding. Use a single-image preview or map batchSize.'
    );
  }
  if (input.model && !preset.bindings.model?.length) {
    throw new Error('This workflow has no model binding for the entry model override.');
  }
  const loras: Array<{ name: string; weight: number }> = [];
  const prompt = input.prompt
    .replace(
      /<lora:([^:>]+):([+-]?(?:\d+\.?\d*|\.\d+))>/gi,
      (_tag, name: string, weight: string) => {
        loras.push({ name, weight: Number(weight) });
        return '';
      }
    )
    .replace(/,\s*,/g, ',')
    .replace(/^\s*,|,\s*$/g, '')
    .trim();
  if (/<lora[:>]/i.test(prompt))
    throw new Error('Unsupported LoRA tag. Use <lora:name:weight>.');
  if (loras.length && !preset.builtin) {
    throw new Error(
      'Dynamic library LoRAs require the standard workflow. Configure LoRA nodes in a custom workflow instead.'
    );
  }
  const requestedSeed = input.seed ?? settings.seed;
  if (requestedSeed !== -1 && (!Number.isSafeInteger(requestedSeed) || requestedSeed < 0)) {
    throw new Error('Seed must be -1 or a non-negative safe integer.');
  }
  const values: Record<WorkflowField, string | number> = {
    positivePrompt: prompt,
    negativePrompt: input.negativePrompt,
    model: input.model?.trim() || settings.model,
    seed: requestedSeed === -1 ? randomInt(0, 2 ** 48 - 1) : requestedSeed,
    steps: settings.steps,
    width: settings.width,
    height: settings.height,
    batchSize,
  };
  for (const [field, targets] of Object.entries(preset.bindings)) {
    for (const target of targets ?? []) {
      if (field === 'model' && !values.model) continue;
      graph[target.nodeId].inputs[target.input] = values[field as WorkflowField];
    }
  }
  if (loras.length) {
    let modelLink: [string, number] = ['4', 0];
    let clipLink: [string, number] = ['4', 1];
    for (const [index, lora] of loras.entries()) {
      const id = `qs-lora-${index}`;
      graph[id] = {
        class_type: 'LoraLoader',
        inputs: {
          model: modelLink,
          clip: clipLink,
          lora_name: resolveLora(lora.name, catalogChoices(catalog, 'LoraLoader', 'lora_name')),
          strength_model: lora.weight,
          strength_clip: lora.weight,
        },
      };
      modelLink = [id, 0];
      clipLink = [id, 1];
    }
    graph['3'].inputs.model = modelLink;
    graph['6'].inputs.clip = clipLink;
    graph['7'].inputs.clip = clipLink;
  }
  for (const [nodeId, node] of Object.entries(graph)) {
    const info = catalog[node.class_type];
    if (!info)
      throw new Error(
        `ComfyUI node class "${node.class_type}" is not installed (node ${nodeId}).`
      );
    for (const [key, spec] of Object.entries(info.input?.required ?? {})) {
      if (!Object.hasOwn(node.inputs, key))
        throw new Error(`Node ${nodeId} is missing input ${key}.`);
      const value = node.inputs[key];
      if (Array.isArray(value)) continue;
      const type = spec[0];
      if (Array.isArray(type) && !type.includes(value))
        throw new Error(`Node ${nodeId}: ${key} "${String(value)}" is unavailable.`);
      if (type === 'STRING' && typeof value !== 'string')
        throw new Error(`Node ${nodeId}: ${key} must be text.`);
      if (
        (type === 'INT' || type === 'FLOAT') &&
        (typeof value !== 'number' || !Number.isFinite(value))
      ) {
        throw new Error(`Node ${nodeId}: ${key} must be a finite number.`);
      }
      const limits = asRecord(spec[1]);
      if (typeof value === 'number' && (type === 'INT' || type === 'FLOAT')) {
        if (
          (type === 'INT' && !Number.isInteger(value)) ||
          (typeof limits.min === 'number' && value < limits.min) ||
          (typeof limits.max === 'number' && value > limits.max)
        ) {
          throw new Error(`Node ${nodeId}: ${key} is outside the supported range.`);
        }
      }
    }
  }
  for (const id of preset.outputNodeIds) {
    if (!catalog[graph[id].class_type]?.output_node)
      throw new Error(`Node ${id} is not a ComfyUI output node.`);
  }
  return graph;
}
