import { Circle, FolderOpen, LoaderCircle, Pause, Play, Plus, Square } from 'lucide-react';
import type { GenerationQueueController } from '../features/generation/useGenerationQueue';
import { IconButton } from './IconButton';

export function GenerationStatusBar({
  queue,
  onOpenQueue,
}: {
  queue: GenerationQueueController;
  onOpenQueue: () => void;
}) {
  const canStart =
    queue.isConnected &&
    !queue.isSyncing &&
    (queue.status === 'paused' || (!queue.isBusy && queue.queueLength > 0));

  return (
    <footer className="generation-status-bar" aria-label="Generation controls">
      <div className="status-selection">
        <span className="status-dot" data-status={queue.isConnected ? queue.status : 'offline'} />
        <div>
          <strong>{queue.selectedCount} selected</strong>
          <span>{queue.combinationCount.toLocaleString()} combinations</span>
        </div>
      </div>
      <button type="button" className="queue-status-link" onClick={onOpenQueue}>
        {queue.status === 'running' ? (
          <LoaderCircle size={16} className="spin" />
        ) : (
          <Circle size={14} />
        )}
        <span>
          {queue.isConnected ? queue.status : 'Connecting'}
          <small>{queue.queueLength} queued</small>
        </span>
        {queue.runTotal > 0 ? (
          <span className="tabular">
            {queue.runCompleted} / {queue.runTotal}
          </span>
        ) : null}
      </button>
      <div className="status-feedback" role="status">
        <span className={queue.error ? 'is-error' : ''}>{queue.error ?? queue.message}</span>
      </div>
      <div className="status-actions">
        <IconButton label="Open output folder" onClick={() => void queue.openOutput()}>
          <FolderOpen size={17} />
        </IconButton>
        <button
          type="button"
          className="secondary-button"
          disabled={
            !queue.isConnected || queue.isBusy || queue.isSyncing || queue.selectedCount === 0
          }
          onClick={() => void queue.addSelection()}
        >
          <Plus size={16} /> Add to queue
        </button>
        {queue.status === 'running' ? (
          <button
            type="button"
            className="primary-button"
            disabled={queue.isSyncing}
            onClick={() => void queue.pause()}
          >
            <Pause size={16} /> Pause
          </button>
        ) : (
          <button
            type="button"
            className="primary-button"
            disabled={!canStart}
            onClick={() => void queue.start()}
          >
            <Play size={16} /> {queue.status === 'paused' ? 'Resume' : 'Start'}
          </button>
        )}
        <IconButton
          className="icon-button danger-text"
          label="Abort generation"
          disabled={!queue.isBusy || queue.isSyncing}
          onClick={() => void queue.abort()}
        >
          <Square size={16} />
        </IconButton>
      </div>
    </footer>
  );
}
