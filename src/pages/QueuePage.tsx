import {
  AlertCircle,
  ArrowRight,
  FolderOpen,
  ListOrdered,
  LoaderCircle,
  Trash2,
} from 'lucide-react';
import { formatGenerationDuration } from '../features/generation/generationStatistics';
import type { GenerationQueueController } from '../features/generation/useGenerationQueue';

export function QueuePage({
  queue,
  onOpenLibrary,
}: {
  queue: GenerationQueueController;
  onOpenLibrary: () => void;
}) {
  const { statistics } = queue;
  const remaining = !queue.isConnected
    ? 'Unavailable'
    : statistics.estimatedRemainingSeconds === null
      ? queue.isBusy
        ? 'After first image'
        : 'Not available'
      : `${queue.isBusy ? '~ ' : ''}${formatGenerationDuration(statistics.estimatedRemainingSeconds)}`;

  return (
    <section className="queue-page" aria-label="Generation queue">
      <div className="section-toolbar">
        <div>
          <h2>Generation queue</h2>
          <p className="field-hint">
            {queue.queueLength} waiting{queue.activeJobLabel ? ' / 1 current' : ''}
          </p>
        </div>
        <div className="inline-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => void queue.openOutput()}
          >
            <FolderOpen size={16} /> Open output
          </button>
          <button
            type="button"
            className="secondary-button danger-text"
            disabled={
              !queue.isConnected || queue.isBusy || queue.isSyncing || queue.queueLength === 0
            }
            onClick={() => void queue.clear()}
          >
            <Trash2 size={16} /> Clear queue
          </button>
        </div>
      </div>
      {queue.error ? (
        <div className="inline-notice is-error" role="alert">
          <AlertCircle size={17} />
          {queue.error}
        </div>
      ) : null}
      <div className="queue-run-summary">
        <div>
          <span className="eyebrow">Current run</span>
          <h3 className="capitalize">{queue.status}</h3>
        </div>
        <div className="queue-run-progress">
          <div className="section-toolbar">
            <span>
              {queue.runCompleted} / {queue.runTotal} processed
            </span>
            <strong className="tabular">{queue.progress}%</strong>
          </div>
          <progress max={100} value={queue.progress} aria-label="Generation progress" />
        </div>
      </div>
      <dl className="queue-statistics" aria-label="Run statistics">
        <div>
          <dt>Generated images</dt>
          <dd>{statistics.generatedImages.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Average / image</dt>
          <dd>
            {statistics.averageSecondsPerImage === null
              ? 'Not measured'
              : `${statistics.averageSecondsPerImage.toFixed(1)} s`}
          </dd>
        </div>
        <div>
          <dt>Last image</dt>
          <dd>
            {statistics.lastSecondsPerImage === null
              ? 'Not measured'
              : `${statistics.lastSecondsPerImage.toFixed(1)} s`}
          </dd>
        </div>
        <div>
          <dt>{queue.status === 'paused' ? 'Remaining work (paused)' : 'Estimated remaining'}</dt>
          <dd>{remaining}</dd>
        </div>
      </dl>
      {queue.activeJobLabel ? (
        <div className="queue-current-job">
          <LoaderCircle size={19} className={queue.status === 'running' ? 'spin' : ''} />
          <div>
            <span className="eyebrow">Current job</span>
            <p>{queue.activeJobLabel}</p>
            {statistics.activeJobSeconds !== null ? (
              <span className="field-hint">
                Elapsed: {formatGenerationDuration(statistics.activeJobSeconds)}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      {queue.queuePreview.length > 0 ? (
        <ol className="queue-job-list" aria-label="Waiting jobs">
          {queue.queuePreview.map((item, index) => (
            <li key={item.id}>
              <span className="queue-job-number tabular">{String(index + 1).padStart(2, '0')}</span>
              <p>{item.summary}</p>
              <span className="queue-job-state">Waiting</span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty-state">
          <ListOrdered size={32} strokeWidth={1.25} />
          <h3>{queue.activeJobLabel ? 'No more jobs waiting' : 'Your queue is empty'}</h3>
          <button type="button" className="secondary-button" onClick={onOpenLibrary}>
            Open library <ArrowRight size={15} />
          </button>
        </div>
      )}
    </section>
  );
}
