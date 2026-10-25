import { expect, test } from '@playwright/test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { handleGenerationRequest } from '../dev-server/generation-api';
import type { GenerationStatusResponse } from '../src/features/generation/generationApi';

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('generation API statistics measure saved images and reset independently of failures', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'queue-statistics-'));
  const imageRequests: ServerResponse[] = [];
  const imageApi = createServer((request, response) => {
    request.resume();
    imageRequests.push(response);
  });
  const queueApi = createServer((request, response) => {
    void handleGenerationRequest(
      request,
      response,
      new URL(request.url!, 'http://localhost'),
      projectRoot
    ).catch((error) => {
      response.writeHead(500).end(String(error));
    });
  });
  const imageUrl = await listen(imageApi);
  const queueUrl = await listen(queueApi);
  async function call(endpoint: string, body?: unknown): Promise<GenerationStatusResponse> {
    const response = await fetch(
      `${queueUrl}/api/generation/${endpoint}`,
      body === undefined
        ? undefined
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
    );
    expect(response.ok).toBe(true);
    return (await response.json()) as GenerationStatusResponse;
  }

  try {
    await mkdir(path.join(projectRoot, 'data'));
    await writeFile(
      path.join(projectRoot, 'data', 'settings.json'),
      JSON.stringify({ connection: { apiUrl: imageUrl } })
    );
    const items = [1, 2].map((index) => ({
      id: `test-${index}`,
      summary: `Landscape ${index}`,
      prompt: 'landscape',
      negativePrompt: '',
    }));
    await call('queue/add', { items });
    const started = await call('start', {});
    expect(started.statistics?.averageSecondsPerImage).toBeNull();
    await expect.poll(() => imageRequests.length).toBe(1);
    await call('pause', {});
    const image =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=';
    imageRequests[0]
      .writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ images: [image, image] }));
    await expect.poll(async () => (await call('status')).statistics?.generatedImages).toBe(2);
    const paused = await call('status');
    expect(paused.status).toBe('paused');
    expect(paused.statistics?.averageSecondsPerImage).toBeGreaterThan(0);
    expect(paused.statistics?.estimatedRemainingSeconds).toBeGreaterThan(0);
    expect(paused.statistics?.activeJobSeconds).toBeNull();
    const resumed = await call('start', {});
    expect(resumed.statistics?.generatedImages).toBe(2);
    await expect.poll(() => imageRequests.length).toBe(2);
    imageRequests[1]
      .writeHead(503, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ message: 'Simulated failure' }));
    await expect.poll(async () => (await call('status')).status).toBe('completed');
    const completed = await call('status');
    expect(completed.runCompleted).toBe(2);
    expect(completed.lastError).toBe('Simulated failure');
    expect(completed.statistics).toMatchObject({
      generatedImages: 2,
      averageSecondsPerImage: paused.statistics?.averageSecondsPerImage,
      estimatedRemainingSeconds: 0,
    });
    const files = await readdir(path.join(projectRoot, 'output'), { recursive: true });
    expect(files.filter((file) => file.endsWith('.png'))).toHaveLength(2);
    const cleared = await call('queue/clear', {});
    expect(cleared.statistics).toMatchObject({
      generatedImages: 0,
      averageSecondsPerImage: null,
      estimatedRemainingSeconds: null,
    });
    await call('queue/add', { items: [items[0]] });
    await call('start', {});
    await expect.poll(() => imageRequests.length).toBe(3);
    const aborted = await call('abort', {});
    expect(aborted.statistics).toMatchObject({
      generatedImages: 0,
      activeJobSeconds: null,
      estimatedRemainingSeconds: null,
    });
  } finally {
    await fetch(`${queueUrl}/api/generation/abort`, { method: 'POST' }).catch(() => {});
    for (const response of imageRequests) response.destroy();
    for (const server of [queueApi, imageApi]) server.closeAllConnections();
    await Promise.all(
      [queueApi, imageApi].map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve()))
          )
      )
    );
    await rm(projectRoot, { recursive: true, force: true });
  }
});
