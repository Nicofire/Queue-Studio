import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  CategoryDefinition,
  CategorySelectionMap,
  CategoryTemplate,
} from '../features/categories/categoryTypes';
import { buildQueueCombinations } from '../features/categories/queueBuilder';
import {
  abortGeneration,
  addQueueToGeneration,
  clearGenerationQueue,
  getGenerationStatus,
  openCurrentOutputFolder,
  pauseGeneration,
  startGeneration,
  type GenerationQueueItemPayload,
  type GenerationQueueItemPreview,
  type GenerationStatus,
  type GenerationStatusResponse,
} from '../features/generation/generationApi';
import { composeGenerationPrompt } from '../features/generation/promptComposition';

type GenerationQueueDockProps = {
  categories: CategoryDefinition[];
  selectionByCategory: CategorySelectionMap;
  globalPositivePrompt: string;
  globalNegativePrompt: string;
};

const STATUS_POLL_INTERVAL_MS = 1500;

export function GenerationQueueDock({
  categories,
  selectionByCategory,
  globalPositivePrompt,
  globalNegativePrompt,
}: GenerationQueueDockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isQueueViewExpanded, setIsQueueViewExpanded] = useState(false);
  const [queueItems, setQueueItems] = useState<GenerationQueueItemPreview[]>([]);
  const [queueStatus, setQueueStatus] = useState<GenerationStatus>('idle');
  const [activeJobLabel, setActiveJobLabel] = useState('');
  const [runTotal, setRunTotal] = useState(0);
  const [runCompleted, setRunCompleted] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const progressPercent =
    runTotal > 0 ? Math.min(100, Math.round((runCompleted / runTotal) * 100)) : 0;
  const isBusy = queueStatus === 'running' || queueStatus === 'paused';

  const statusText = useMemo(() => {
    if (queueStatus === 'running') {
      return `Running (${runCompleted}/${runTotal})`;
    }
    if (queueStatus === 'paused') {
      return `Paused (${runCompleted}/${runTotal})`;
    }
    if (queueStatus === 'completed' && runTotal > 0) {
      return `Completed (${runTotal}/${runTotal})`;
    }
    if (queueStatus === 'aborted') {
      return 'Aborted';
    }
    return 'Idle';
  }, [queueStatus, runCompleted, runTotal]);

  const visibleQueueItems = useMemo(() => {
    const items = [...queueItems];

    if (activeJobLabel) {
      items.unshift({
        id: 'active-job',
        summary: `${activeJobLabel} (current)`,
      });
    }

    return items;
  }, [activeJobLabel, queueItems]);

  const applyBackendStatus = useCallback((status: GenerationStatusResponse) => {
    setQueueItems(status.queuePreview);
    setQueueStatus(status.status);
    setActiveJobLabel(status.activeJobLabel ?? '');
    setRunTotal(status.runTotal);
    setRunCompleted(status.runCompleted);
    if (status.lastError) {
      setStatusMessage(status.lastError);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const syncStatus = async () => {
      try {
        const status = await getGenerationStatus();
        if (!isMounted) {
          return;
        }
        applyBackendStatus(status);
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setStatusMessage(
          error instanceof Error ? error.message : 'Could not fetch generation status.'
        );
      }
    };

    void syncStatus();
    const pollId = window.setInterval(() => {
      void syncStatus();
    }, STATUS_POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(pollId);
    };
  }, [applyBackendStatus]);

  const buildQueuePayloadFromSelection = (): GenerationQueueItemPayload[] => {
    const combinations = buildQueueCombinations(categories, selectionByCategory);

    const templatesByCategory = new Map(
      categories.map((category) => [
        category.id,
        new Map(category.templates.map((template) => [template.templateId, template])),
      ])
    );

    return combinations
      .filter((combination) => Object.values(combination).some((templateId) => Boolean(templateId)))
      .map((combination, index) => {
        const selectedTemplates: CategoryTemplate[] = [];

        const summary = categories
          .map((category) => {
            const templateId = combination[category.id];
            if (!templateId) {
              return `${category.title}: -`;
            }

            const template = templatesByCategory.get(category.id)?.get(templateId);
            if (!template) {
              return `${category.title}: ${templateId}`;
            }

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
        } satisfies GenerationQueueItemPayload;
      })
      .filter((item) => item.prompt.length > 0);
  };

  const handleAddQueue = async () => {
    if (isBusy) {
      setStatusMessage('Pause or abort generation before adding new queue items.');
      return;
    }

    const queueToAdd = buildQueuePayloadFromSelection();

    if (queueToAdd.length === 0) {
      setStatusMessage('Select at least one entry with a positive prompt before adding to queue.');
      return;
    }

    try {
      setIsSyncing(true);
      const status = await addQueueToGeneration(queueToAdd);
      applyBackendStatus(status);
      setStatusMessage(`Added ${queueToAdd.length} item(s) to backend queue.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not add queue items.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearQueue = async () => {
    try {
      setIsSyncing(true);
      const status = await clearGenerationQueue();
      applyBackendStatus(status);
      setStatusMessage('Backend queue cleared.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not clear queue.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleStartGenerate = async () => {
    try {
      setIsSyncing(true);
      const wasPaused = queueStatus === 'paused';
      const status = await startGeneration();
      applyBackendStatus(status);
      setStatusMessage(wasPaused ? 'Generation resumed.' : 'Generation started.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not start generation.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePause = async () => {
    try {
      setIsSyncing(true);
      const status = await pauseGeneration();
      applyBackendStatus(status);
      setStatusMessage('Generation paused.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not pause generation.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOpenOutputFolder = async () => {
    try {
      setIsSyncing(true);
      await openCurrentOutputFolder();
      setStatusMessage("Opened today's output folder.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not open output folder.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAbort = async () => {
    try {
      setIsSyncing(true);
      const status = await abortGeneration();
      applyBackendStatus(status);
      setStatusMessage('Generation aborted.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not abort generation.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <>
      <aside className={isExpanded ? 'generation-dock is-expanded' : 'generation-dock'}>
        <button
          type="button"
          className="generation-dock-toggle"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((current) => !current)}
        >
          <span className="generation-dock-title">Generation Queue</span>
          <span className="generation-dock-meta">{queueItems.length} pending</span>
          <span className={isExpanded ? 'generation-dock-arrow is-open' : 'generation-dock-arrow'}>
            {'>'}
          </span>
        </button>

        <div className={isExpanded ? 'generation-dock-panel is-visible' : 'generation-dock-panel'}>
          <div className="generation-progress-head">
            <div className="generation-progress-row">
              <span className="field-hint">{statusText}</span>
              <span className="field-hint">{progressPercent}%</span>
            </div>
            <div
              className="generation-progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
              aria-label="Generation progress"
            >
              <div className="generation-progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          <div className="generation-dock-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => void handleAddQueue()}
              disabled={isBusy || isSyncing}
            >
              Add Queue
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void handleClearQueue()}
              disabled={isSyncing}
            >
              Clear Queue
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => void handleStartGenerate()}
              disabled={isSyncing}
            >
              Start Generate
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void handleOpenOutputFolder()}
              disabled={isSyncing}
            >
              Open Output
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void handlePause()}
              disabled={queueStatus !== 'running' || isSyncing}
            >
              Pause
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void handleAbort()}
              disabled={(queueStatus !== 'running' && queueStatus !== 'paused') || isSyncing}
            >
              Abort
            </button>
          </div>

          {activeJobLabel ? <p className="field-hint">Current: {activeJobLabel}</p> : null}
          {statusMessage ? <p className="field-hint">{statusMessage}</p> : null}
        </div>
      </aside>

      <aside className={isQueueViewExpanded ? 'queue-view-dock is-expanded' : 'queue-view-dock'}>
        <button
          type="button"
          className="queue-view-dock-toggle"
          aria-expanded={isQueueViewExpanded}
          onClick={() => setIsQueueViewExpanded((current) => !current)}
        >
          <span className="generation-dock-title">Current Queue</span>
          <span className="generation-dock-meta">{visibleQueueItems.length} item(s)</span>
          <span
            className={
              isQueueViewExpanded ? 'generation-dock-arrow is-open' : 'generation-dock-arrow'
            }
          >
            {'>'}
          </span>
        </button>

        <div
          className={
            isQueueViewExpanded ? 'queue-view-dock-panel is-visible' : 'queue-view-dock-panel'
          }
        >
          {visibleQueueItems.length === 0 ? (
            <p className="field-hint">Queue is currently empty.</p>
          ) : (
            <ol className="queue-view-list">
              {visibleQueueItems.map((item) => (
                <li key={item.id} className="queue-view-item" title={item.summary}>
                  {item.summary}
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>
    </>
  );
}
