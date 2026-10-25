import { expect, test } from '@playwright/test';
import { GenerationStatistics } from '../src/features/generation/generationStatistics';

test.describe('generation statistics', () => {
  test('needs a successful sample before estimating', () => {
    const statistics = new GenerationStatistics();
    statistics.startJob(0);
    expect(statistics.snapshot(3, 'running', 5000)).toMatchObject({
      generatedImages: 0,
      averageSecondsPerImage: null,
      estimatedRemainingSeconds: null,
      activeJobSeconds: 5,
    });
  });

  test('averages actual images and accounts for the active job', () => {
    const statistics = new GenerationStatistics();
    statistics.startJob(0);
    statistics.finishJob(1, 10000);
    statistics.startJob(10000);
    expect(statistics.snapshot(2, 'running', 14000).estimatedRemainingSeconds).toBe(26);
    statistics.finishJob(2, 30000);
    expect(statistics.snapshot(0, 'completed', 30000)).toMatchObject({
      generatedImages: 3,
      averageSecondsPerImage: 10,
      lastSecondsPerImage: 10,
      estimatedRemainingSeconds: 0,
    });
  });

  test('excludes paused waiting time between jobs', () => {
    const statistics = new GenerationStatistics();
    statistics.startJob(0);
    statistics.finishJob(1, 10000);
    expect(statistics.snapshot(2, 'paused', 100000).estimatedRemainingSeconds).toBe(20);
    statistics.startJob(100000);
    statistics.finishJob(1, 110000);
    expect(statistics.snapshot(1, 'running', 110000).averageSecondsPerImage).toBe(10);
  });

  test('excludes failures and ignores an aborted late completion', () => {
    const statistics = new GenerationStatistics();
    statistics.startJob(0);
    statistics.finishJob(1, 10000);
    statistics.startJob(10000);
    statistics.cancelJob();
    statistics.finishJob(1, 90000);
    expect(statistics.snapshot(0, 'aborted', 90000)).toMatchObject({
      generatedImages: 1,
      averageSecondsPerImage: 10,
      activeJobSeconds: null,
      estimatedRemainingSeconds: null,
    });
  });

  test('does not report zero remaining during an overdue job and resets for a new run', () => {
    const statistics = new GenerationStatistics();
    statistics.startJob(0);
    statistics.finishJob(1, 10000);
    statistics.startJob(10000);
    expect(statistics.snapshot(0, 'running', 30000).estimatedRemainingSeconds).toBe(1);
    statistics.reset();
    expect(statistics.snapshot(2, 'idle', 30000)).toMatchObject({
      generatedImages: 0,
      averageSecondsPerImage: null,
      lastSecondsPerImage: null,
      estimatedRemainingSeconds: null,
    });
  });
});
