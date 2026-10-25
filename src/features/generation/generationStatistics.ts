export type GenerationStatisticsSnapshot = {
  generatedImages: number;
  averageSecondsPerImage: number | null;
  lastSecondsPerImage: number | null;
  activeJobSeconds: number | null;
  estimatedRemainingSeconds: number | null;
};

export const EMPTY_GENERATION_STATISTICS: GenerationStatisticsSnapshot = {
  generatedImages: 0,
  averageSecondsPerImage: null,
  lastSecondsPerImage: null,
  activeJobSeconds: null,
  estimatedRemainingSeconds: null,
};

export function formatGenerationDuration(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${remainder}s`;
  if (minutes > 0) return `${minutes}m ${remainder}s`;
  return `${remainder}s`;
}

export class GenerationStatistics {
  private generatedImages = 0;
  private completedJobs = 0;
  private totalJobMs = 0;
  private lastSecondsPerImage: number | null = null;
  private startedAt: number | null = null;

  reset() {
    this.generatedImages = 0;
    this.completedJobs = 0;
    this.totalJobMs = 0;
    this.lastSecondsPerImage = null;
    this.startedAt = null;
  }

  startJob(now = performance.now()) {
    this.startedAt = now;
  }

  finishJob(imageCount: number, now = performance.now()) {
    if (this.startedAt === null) return;
    const elapsed = Math.max(0, now - this.startedAt);
    this.startedAt = null;
    if (imageCount <= 0) return;
    this.generatedImages += imageCount;
    this.completedJobs += 1;
    this.totalJobMs += elapsed;
    this.lastSecondsPerImage = elapsed / imageCount / 1000;
  }

  cancelJob() {
    this.startedAt = null;
  }

  snapshot(
    queueLength: number,
    status: string,
    now = performance.now()
  ): GenerationStatisticsSnapshot {
    const activeMs = this.startedAt === null ? null : Math.max(0, now - this.startedAt);
    let remaining: number | null = status === 'completed' ? 0 : null;
    if ((status === 'running' || status === 'paused') && this.completedJobs > 0) {
      const averageJobMs = this.totalJobMs / this.completedJobs;
      const activeRemainingMs = activeMs === null ? 0 : Math.max(1000, averageJobMs - activeMs);
      remaining = (queueLength * averageJobMs + activeRemainingMs) / 1000;
    }
    return {
      generatedImages: this.generatedImages,
      averageSecondsPerImage:
        this.generatedImages > 0 ? this.totalJobMs / this.generatedImages / 1000 : null,
      lastSecondsPerImage: this.lastSecondsPerImage,
      activeJobSeconds: activeMs === null ? null : activeMs / 1000,
      estimatedRemainingSeconds: remaining,
    };
  }
}
