import type { WorkflowPreset } from '../src/features/generation/comfyWorkflow.ts';
import type { NodeCatalog } from './comfyui-workflows.ts';

export type GenerationParameters = {
  apiUrl: string;
  model: string;
  seed: number;
  steps: number;
  width: number;
  height: number;
  timeoutSeconds?: number;
  workflowId?: string;
};

export type GenerationInput = {
  prompt: string;
  negativePrompt: string;
  model?: string;
  seed?: number;
};

export type GenerationProvider = {
  id: 'automatic1111' | 'comfyui';
  listModels: (
    apiUrl: string,
    signal: AbortSignal
  ) => Promise<Array<{ id: string; label: string }>>;
  prepare?: (
    settings: GenerationParameters,
    projectRoot: string,
    inputs: GenerationInput[],
    batchSize: number,
    signal: AbortSignal
  ) => Promise<ProviderContext>;
  generate: (
    settings: GenerationParameters,
    input: GenerationInput,
    batchSize: number,
    signal: AbortSignal,
    context?: ProviderContext
  ) => Promise<string[]>;
};

export type ProviderContext = {
  workflow?: WorkflowPreset;
  catalog?: NodeCatalog;
  onCancellation?: (message: string) => void;
};
