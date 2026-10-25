import { randomUUID } from 'node:crypto';
import type {
  ConnectionProfile,
  ProviderId,
} from '../src/features/settings/generationSettings.ts';
import type { ProviderContext } from './generation-provider.ts';

export type GenerationOperation = {
  id: string;
  kind: 'queue' | 'preview' | 'configuration';
  controller: AbortController;
  settings?: ConnectionProfile & { provider: ProviderId };
  context?: ProviderContext;
  cancellationMessage?: string;
  done: Promise<void>;
  release: () => void;
};

let activeOperation: GenerationOperation | null = null;

export function getActiveOperation() {
  return activeOperation;
}

export function beginOperation(kind: GenerationOperation['kind']) {
  if (activeOperation)
    throw new Error('Another generation or configuration operation is active.');
  let release!: () => void;
  const done = new Promise<void>((resolve) => {
    release = resolve;
  });
  const operation: GenerationOperation = {
    id: randomUUID(),
    kind,
    controller: new AbortController(),
    done,
    release,
  };
  activeOperation = operation;
  return operation;
}

export function finishOperation(operation: GenerationOperation) {
  if (activeOperation?.id === operation.id) activeOperation = null;
  operation.release();
}
