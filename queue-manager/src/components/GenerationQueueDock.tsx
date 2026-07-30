import { useEffect, useMemo, useState } from 'react';

import type {
  CategoryDefinition,
  CategorySelectionMap,
} from '../features/categories/categoryTypes';
import { buildQueueCombinations } from '../features/categories/queueBuilder';

type QueueStatus = 'idle' | 'running' | 'paused' | 'aborted' | 'completed';

type QueueItem = {
  id: string;
  summary: string;
};

type GenerationQueueDockProps = {
  categories: CategoryDefinition[];
  selectionByCategory: CategorySelectionMap;
};

const STEP_DURATION_MS = 850;

export function GenerationQueueDock({ categories, selectionByCategory }: GenerationQueueDockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isQueueViewExpanded, setIsQueueViewExpanded] = useState(false);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [queueStatus, setQueueStatus] = useState<QueueStatus>('idle');
  const [activeJobLabel, setActiveJobLabel] = useState('');
  const [runTotal, setRunTotal] = useState(0);
  const [runCompleted, setRunCompleted] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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

  useEffect(() => {
    if (queueStatus !== 'running') {
      return;
    }

    if (queueItems.length === 0) {
      setQueueStatus('completed');
      setActiveJobLabel('');
      setStatusMessage('Generation finished.');
      return;
    }

    const timerId = window.setTimeout(() => {
      setQueueItems((current) => {
        if (current.length === 0) {
          return current;
        }

        const [active, ...rest] = current;
        setActiveJobLabel(active.summary);
        setRunCompleted((currentCompleted) => currentCompleted + 1);

        if (rest.length === 0) {
          setQueueStatus('completed');
          setStatusMessage('Generation finished.');
        }

        return rest;
      });
    }, STEP_DURATION_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [queueStatus, queueItems]);

  const handleAddQueue = () => {
    if (isBusy) {
      setStatusMessage('Pause or abort generation before adding new queue items.');
      return;
    }

    const combinations = buildQueueCombinations(categories, selectionByCategory);

    const templateByCategory = new Map(
      categories.map((category) => [
        category.id,
        new Map(category.templates.map((template) => [template.templateId, template.title])),
      ])
    );

    const queueToAdd = combinations
      .filter((combination) => Object.values(combination).some((templateId) => Boolean(templateId)))
      .map((combination, index) => {
        const summary = categories
          .map((category) => {
            const templateId = combination[category.id];
            if (!templateId) {
              return `${category.title}: -`;
            }

            const title = templateByCategory.get(category.id)?.get(templateId) ?? templateId;
            return `${category.title}: ${title}`;
          })
          .join(' | ');

        return {
          id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 9)}`,
          summary,
        } satisfies QueueItem;
      });

    if (queueToAdd.length === 0) {
      setStatusMessage('Select at least one entry before adding to queue.');
      return;
    }

    setQueueItems((current) => [...current, ...queueToAdd]);
    setQueueStatus('idle');
    setStatusMessage(`Added ${queueToAdd.length} item(s) to queue.`);
  };

  const handleClearQueue = () => {
    setQueueItems([]);
    setActiveJobLabel('');
    setRunTotal(0);
    setRunCompleted(0);
    setQueueStatus('idle');
    setStatusMessage('Queue cleared.');
  };

  const handleStartGenerate = () => {
    if (queueStatus === 'running') {
      return;
    }

    if (queueStatus === 'paused') {
      setQueueStatus('running');
      setStatusMessage('Generation resumed.');
      return;
    }

    if (queueItems.length === 0) {
      setStatusMessage('Queue is empty. Add queue items first.');
      return;
    }

    setRunTotal(queueItems.length);
    setRunCompleted(0);
    setQueueStatus('running');
    setStatusMessage('Generation started.');
  };

  const handlePause = () => {
    if (queueStatus !== 'running') {
      return;
    }

    setQueueStatus('paused');
    setStatusMessage('Generation paused.');
  };

  const handleAbort = () => {
    if (queueStatus !== 'running' && queueStatus !== 'paused') {
      return;
    }

    setQueueStatus('aborted');
    setActiveJobLabel('');
    setRunTotal(0);
    setRunCompleted(0);
    setStatusMessage('Generation aborted.');
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
              onClick={handleAddQueue}
              disabled={isBusy}
            >
              Add Queue
            </button>
            <button className="secondary-button" type="button" onClick={handleClearQueue}>
              Clear Queue
            </button>
            <button className="primary-button" type="button" onClick={handleStartGenerate}>
              Start Generate
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={handlePause}
              disabled={queueStatus !== 'running'}
            >
              Pause
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={handleAbort}
              disabled={queueStatus !== 'running' && queueStatus !== 'paused'}
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
