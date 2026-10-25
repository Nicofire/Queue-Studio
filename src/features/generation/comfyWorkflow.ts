import { asRecord } from '../settings/generationSettings.ts';

export const WORKFLOW_FIELDS = [
  'positivePrompt',
  'negativePrompt',
  'model',
  'seed',
  'steps',
  'width',
  'height',
  'batchSize',
] as const;
export type WorkflowField = (typeof WORKFLOW_FIELDS)[number];
export type WorkflowNode = { class_type: string; inputs: Record<string, unknown> };
export type WorkflowGraph = Record<string, WorkflowNode>;
export type WorkflowBinding = { nodeId: string; input: string };
export type WorkflowPreset = {
  id: string;
  name: string;
  graph: WorkflowGraph;
  bindings: Partial<Record<WorkflowField, WorkflowBinding[]>>;
  outputNodeIds: string[];
  builtin?: boolean;
};

export function parseWorkflowPreset(
  value: unknown,
  id: string,
  builtin = false
): WorkflowPreset {
  const source = asRecord(value);
  const rawGraph = asRecord(source.graph);
  const entries = Object.entries(rawGraph);
  if (!entries.length || entries.length > 1000 || source.nodes || rawGraph.nodes) {
    throw new Error(
      'Import a ComfyUI API workflow, not the editor nodes/links format (maximum 1000 nodes).'
    );
  }
  const graph: WorkflowGraph = {};
  for (const [nodeId, rawNode] of entries) {
    const node = asRecord(rawNode);
    if (
      !/^[\w-]+$/.test(nodeId) ||
      ['__proto__', 'constructor', 'prototype'].includes(nodeId) ||
      typeof node.class_type !== 'string' ||
      !node.class_type ||
      !node.inputs ||
      typeof node.inputs !== 'object' ||
      Array.isArray(node.inputs)
    ) {
      throw new Error(`Invalid API workflow node: ${nodeId}.`);
    }
    graph[nodeId] = {
      class_type: node.class_type,
      inputs: structuredClone(asRecord(node.inputs)),
    };
  }
  for (const [nodeId, node] of Object.entries(graph)) {
    for (const input of Object.values(node.inputs)) {
      if (
        Array.isArray(input) &&
        input.length === 2 &&
        typeof input[0] === 'string' &&
        typeof input[1] === 'number' &&
        (!Object.hasOwn(graph, input[0]) || !Number.isInteger(input[1]) || input[1] < 0)
      ) {
        throw new Error(`Node ${nodeId} references an invalid node output.`);
      }
    }
  }
  const bindings: WorkflowPreset['bindings'] = {};
  const boundInputs = new Set<string>();
  const rawBindings = asRecord(source.bindings);
  for (const field of WORKFLOW_FIELDS) {
    const targets = rawBindings[field];
    if (targets === undefined) continue;
    if (!Array.isArray(targets)) throw new Error(`Invalid binding for ${field}.`);
    bindings[field] = targets.map((target: unknown) => {
      const binding = asRecord(target);
      const node = typeof binding.nodeId === 'string' ? graph[binding.nodeId] : undefined;
      if (
        !node ||
        typeof binding.input !== 'string' ||
        !Object.hasOwn(node.inputs, binding.input) ||
        ['__proto__', 'constructor', 'prototype'].includes(binding.input) ||
        Array.isArray(node.inputs[binding.input])
      ) {
        throw new Error(`Invalid ${field} binding: select a literal node input.`);
      }
      const key = `${String(binding.nodeId)}:${binding.input}`;
      if (boundInputs.has(key)) throw new Error(`Input ${key} is assigned more than once.`);
      boundInputs.add(key);
      const current = node.inputs[binding.input];
      const expectedType = ['positivePrompt', 'negativePrompt', 'model'].includes(field)
        ? 'string'
        : 'number';
      if (typeof current !== expectedType)
        throw new Error(`${field} requires a ${expectedType} input.`);
      return { nodeId: binding.nodeId as string, input: binding.input };
    });
  }
  const outputNodeIds = source.outputNodeIds;
  if (
    !Array.isArray(outputNodeIds) ||
    !outputNodeIds.length ||
    outputNodeIds.some((nodeId) => typeof nodeId !== 'string' || !Object.hasOwn(graph, nodeId))
  ) {
    throw new Error('Select at least one existing image output node.');
  }
  if (typeof source.name !== 'string' || !source.name.trim() || source.name.length > 120) {
    throw new Error('Workflow name must contain 1 to 120 characters.');
  }
  return {
    id,
    name: source.name.trim(),
    graph,
    bindings,
    outputNodeIds: [...new Set(outputNodeIds)],
    builtin,
  };
}

export function inferWorkflowBindings(graph: WorkflowGraph): WorkflowPreset['bindings'] {
  const bindings: WorkflowPreset['bindings'] = {};
  const findUnique = (className: string) => {
    const nodes = Object.entries(graph).filter(([, node]) => node.class_type === className);
    return nodes.length === 1 ? nodes[0][0] : undefined;
  };
  const sampler = findUnique('KSampler');
  const latent = findUnique('EmptyLatentImage');
  const checkpoint = findUnique('CheckpointLoaderSimple');
  const bind = (field: WorkflowField, nodeId: string | undefined, input: string) => {
    if (
      nodeId &&
      Object.hasOwn(graph[nodeId].inputs, input) &&
      !Array.isArray(graph[nodeId].inputs[input])
    ) {
      bindings[field] = [{ nodeId, input }];
    }
  };
  if (sampler) {
    bind('seed', sampler, 'seed');
    bind('steps', sampler, 'steps');
    for (const [field, input] of [
      ['positivePrompt', 'positive'],
      ['negativePrompt', 'negative'],
    ] as const) {
      const link = graph[sampler].inputs[input];
      if (
        Array.isArray(link) &&
        typeof link[0] === 'string' &&
        graph[link[0]]?.class_type === 'CLIPTextEncode'
      ) {
        bind(field, link[0], 'text');
      }
    }
  }
  bind('model', checkpoint, 'ckpt_name');
  bind('width', latent, 'width');
  bind('height', latent, 'height');
  bind('batchSize', latent, 'batch_size');
  return bindings;
}
