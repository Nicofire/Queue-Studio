import { useEffect, useRef, useState } from 'react';

import type {
  CategoryDefinition,
  CategorySelectionMap,
  CategoryTemplate,
} from '../categories/categoryTypes';
import { buildQueueCombinations, getQueueCombinationCount } from '../categories/queueBuilder';
import {
  abortGeneration,
  addQueueToGeneration,
  clearGenerationQueue,
  getGenerationStatus,
  openCurrentOutputFolder,
  pauseGeneration,
  startGeneration,
  type GenerationQueueItemPayload,
  type GenerationStatusResponse,
} from './generationApi';
import { EMPTY_GENERATION_STATISTICS } from './generationStatistics';
import { composeGenerationPrompt } from './promptComposition';

type Selection = {
  categories: CategoryDefinition[];
  selectionByCategory: CategorySelectionMap;
  globalPositivePrompt: string;
  globalNegativePrompt: string;
};

const INITIAL_STATUS: GenerationStatusResponse = {
  status: 'idle',
  queueLength: 0,
  queuePreview: [],
  activeJobLabel: null,
  runTotal: 0,
  runCompleted: 0,
  lastError: null,
};

function buildQueuePayload({
  categories,
  selectionByCategory,
  globalPositivePrompt,
  globalNegativePrompt,
}: Selection): GenerationQueueItemPayload[] {
  const templatesByCategory = new Map(
    categories.map((category) => [
      category.id,
      new Map(category.templates.map((template) => [template.templateId, template])),
    ])
  );

  return buildQueueCombinations(categories, selectionByCategory)
    .filter((combination) => Object.values(combination).some(Boolean))
    .map((combination, index) => {
      const selectedTemplates: CategoryTemplate[] = [];
      const summary = categories
        .map((category) => {
          const templateId = combination[category.id];
          if (!templateId) return `${category.title}: -`;
          const template = templatesByCategory.get(category.id)?.get(templateId);
          if (!template) return `${category.title}: ${templateId}`;
          selectedTemplates.push(template.data);
          return `${category.title}: ${template.title}`;
        })
        .join(' | ');
      const composed = composeGenerationPrompt(selectedTemplates, {
        positive: globalPositivePrompt,
        negative: globalNegativePrompt,
      });
      return {
        id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 9)}`,
        summary,
        prompt: composed.prompt,
        negativePrompt: composed.negativePrompt,
        ...(composed.model ? { model: composed.model } : {}),
      };
    })
    .filter((item) => item.prompt.length > 0);
}

export function useGenerationQueue(selection: Selection) {
  const [status, setStatus] = useState(INITIAL_STATUS);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const commandVersion = useRef(0);
  const commandInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const sync = async () => {
      const version = commandVersion.current;
      if (!commandInFlight.current) {
        try {
          const next = await getGenerationStatus();
          if (active && version === commandVersion.current) {
            setStatus(next);
            setIsConnected(true);
            setConnectionError(null);
          }
        } catch (cause) {
          if (active && version === commandVersion.current) {
            setIsConnected(false);
            setConnectionError(
              cause instanceof Error ? cause.message : 'Could not fetch queue status.'
            );
          }
        }
      }
      if (active) timer = setTimeout(() => void sync(), 1500);
    };
    void sync();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  const isBusy = status.status === 'running' || status.status === 'paused';
  const selectedCount = Object.values(selection.selectionByCategory).reduce(
    (sum, ids) => sum + ids.length,
    0
  );
  const combinationCount =
    selectedCount > 0
      ? getQueueCombinationCount(selection.categories, selection.selectionByCategory)
      : 0;

  async function runCommand(operation: () => Promise<GenerationStatusResponse>, success: string) {
    if (commandInFlight.current) return;
    commandInFlight.current = true;
    commandVersion.current += 1;
    setIsSyncing(true);
    setMessage(null);
    setError(null);
    try {
      setStatus(await operation());
      setIsConnected(true);
      setMessage(success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Queue command failed.');
    } finally {
      commandVersion.current += 1;
      commandInFlight.current = false;
      setIsSyncing(false);
    }
  }

  async function addSelection() {
    if (isBusy || commandInFlight.current) return;
    const items = buildQueuePayload(selection);
    if (items.length === 0) {
      setError('Select at least one entry with a positive prompt.');
      return;
    }
    await runCommand(
      () => addQueueToGeneration(items),
      `Added ${items.length} job(s) to the queue.`
    );
  }

  async function openOutput() {
    setError(null);
    try {
      await openCurrentOutputFolder();
      setMessage('Output folder opened.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open output folder.');
    }
  }

  return {
    ...status,
    statistics: status.statistics ?? EMPTY_GENERATION_STATISTICS,
    isBusy,
    isSyncing,
    isConnected,
    selectedCount,
    combinationCount,
    error: connectionError ?? error ?? status.lastError,
    message,
    progress:
      status.runTotal > 0
        ? Math.min(100, Math.round((status.runCompleted / status.runTotal) * 100))
        : 0,
    addSelection,
    start: () =>
      runCommand(
        startGeneration,
        status.status === 'paused' ? 'Generation resumed.' : 'Generation started.'
      ),
    pause: () => runCommand(pauseGeneration, 'Generation paused.'),
    abort: () => runCommand(abortGeneration, 'Generation aborted.'),
    clear: () => runCommand(clearGenerationQueue, 'Queue cleared.'),
    openOutput,
  };
}

export type GenerationQueueController = ReturnType<typeof useGenerationQueue>;
