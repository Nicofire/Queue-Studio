import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

import {
  GenerationStatistics,
  type GenerationStatisticsSnapshot,
} from '../src/features/generation/generationStatistics.ts';
import {
  composeGenerationPrompt,
  resolveSelectedPresetText,
  type PromptPresetSource,
} from '../src/features/generation/promptComposition.ts';
import {
  getActiveConnection,
  validateApiUrl,
  type ProviderId,
} from '../src/features/settings/generationSettings.ts';
import {
  beginOperation,
  finishOperation,
  getActiveOperation,
  type GenerationOperation,
} from './generation-operations.ts';
import { getGenerationProvider } from './generation-providers.ts';
import {
  assertSavedConnection,
  readGenerationSettings,
  SavedConnectionMismatchError,
} from './generation-settings.ts';
import { pathExists, readRequestBody, RequestBodyTooLargeError, sendJson } from './http-utils.ts';

export const GENERATION_STATUS_PATH = '/api/generation/status';
export const GENERATION_QUEUE_ADD_PATH = '/api/generation/queue/add';
export const GENERATION_QUEUE_CLEAR_PATH = '/api/generation/queue/clear';
export const GENERATION_START_PATH = '/api/generation/start';
export const GENERATION_PAUSE_PATH = '/api/generation/pause';
export const GENERATION_ABORT_PATH = '/api/generation/abort';
export const GENERATION_OPEN_OUTPUT_PATH = '/api/generation/output/open-today';
export const GENERATION_PREVIEW_PATH = '/api/generation/preview';

const MAX_JSON_BODY_BYTES = 1_500_000;

type GenerationStatus = 'idle' | 'running' | 'paused' | 'aborted' | 'completed';

type QueueItem = {
  id: string;
  summary: string;
  prompt: string;
  negativePrompt: string;
  model?: string;
  seed?: number;
};

type QueueItemPreview = {
  id: string;
  summary: string;
};

type StatusPayload = {
  provider: ProviderId | null;
  isBusy: boolean;
  operation: GenerationOperation['kind'] | null;
  status: GenerationStatus;
  queueLength: number;
  queuePreview: QueueItemPreview[];
  activeJobLabel: string | null;
  runTotal: number;
  runCompleted: number;
  lastError: string | null;
  statistics: GenerationStatisticsSnapshot;
};

let queueItems: QueueItem[] = [];
let queueStatus: GenerationStatus = 'idle';
let activeJobLabel: string | null = null;
let runTotal = 0;
let runCompleted = 0;
let lastError: string | null = null;
let workerPromise: Promise<void> | null = null;
let wakeWorker: (() => void) | null = null;
const generationStatistics = new GenerationStatistics();

function toLocalDateFolderName(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toSafeFileNamePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function detectImageExtension(buffer: Buffer) {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e) {
    return '.png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return '.jpg';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return '.webp';
  }
  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return '.bmp';
  }
  return '.png';
}

function decodeBase64Image(rawImage: string) {
  const normalized = rawImage.trim().replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
  const buffer = Buffer.from(normalized, 'base64');
  if (buffer.length === 0) {
    throw new Error('Generated image payload is empty.');
  }

  return {
    buffer,
    extension: detectImageExtension(buffer),
  };
}

async function saveGeneratedImages(
  projectRoot: string,
  item: QueueItem,
  images: string[],
  signal: AbortSignal
) {
  signal.throwIfAborted();
  const outputDateDir = path.resolve(projectRoot, 'output', toLocalDateFolderName(new Date()));
  await mkdir(outputDateDir, { recursive: true });

  const safeIdPart = toSafeFileNamePart(item.id) || 'job';
  const timestampPart = Date.now();

  await Promise.all(
    images.map(async (rawImage, index) => {
      signal.throwIfAborted();
      const { buffer, extension } = decodeBase64Image(rawImage);
      const fileName = `${safeIdPart}-${timestampPart}-${String(index + 1).padStart(2, '0')}${extension}`;
      const targetPath = path.resolve(outputDateDir, fileName);
      await writeFile(targetPath, buffer);
    })
  );
}

async function getCurrentOutputDir(projectRoot: string) {
  const outputDateDir = path.resolve(projectRoot, 'output', toLocalDateFolderName(new Date()));
  await mkdir(outputDateDir, { recursive: true });
  return outputDateDir;
}

async function openFolderInFileExplorer(folderPath: string) {
  if (process.platform === 'win32') {
    spawn('explorer.exe', [folderPath], { detached: true, stdio: 'ignore' }).unref();
    return;
  }

  if (process.platform === 'darwin') {
    spawn('open', [folderPath], { detached: true, stdio: 'ignore' }).unref();
    return;
  }

  spawn('xdg-open', [folderPath], { detached: true, stdio: 'ignore' }).unref();
}

function buildStatusPayload(): StatusPayload {
  const operation = getActiveOperation();
  return {
    provider: operation?.settings?.provider ?? null,
    isBusy: operation !== null,
    operation: operation?.kind ?? null,
    status: queueStatus,
    queueLength: queueItems.length,
    queuePreview: queueItems.map((item) => ({ id: item.id, summary: item.summary })),
    activeJobLabel,
    runTotal,
    runCompleted,
    lastError,
    statistics: generationStatistics.snapshot(queueItems.length, queueStatus),
  };
}

function wakePausedWorker() {
  if (!wakeWorker) {
    return;
  }

  const resolver = wakeWorker;
  wakeWorker = null;
  resolver();
}

/** Reads a preset file, preferring `data/` over the `public/` fallback copy. */
async function loadPromptPresetGroup(projectRoot: string, fileName: string) {
  const dataPath = path.resolve(projectRoot, 'data', fileName);
  const publicPath = path.resolve(projectRoot, 'public', fileName);
  const presetPath = (await pathExists(dataPath)) ? dataPath : publicPath;

  try {
    const content = await readFile(presetPath, 'utf8');
    return JSON.parse(content.replace(/^\uFEFF/, '')) as PromptPresetSource;
  } catch {
    return null;
  }
}

async function loadGlobalPromptDefaults(projectRoot: string) {
  const [positiveGroup, negativeGroup] = await Promise.all([
    loadPromptPresetGroup(projectRoot, 'positive-presets.json'),
    loadPromptPresetGroup(projectRoot, 'negative-presets.json'),
  ]);

  return {
    positive: resolveSelectedPresetText(positiveGroup),
    negative: resolveSelectedPresetText(negativeGroup),
  };
}

async function runTxt2ImgJob(projectRoot: string, item: QueueItem, operation: GenerationOperation) {
  const images = await requestGeneration(operation, item);
  operation.controller.signal.throwIfAborted();
  await saveGeneratedImages(projectRoot, item, images, operation.controller.signal);
  operation.controller.signal.throwIfAborted();
  return images.length;
}

/** Preview grid sizes the entry editor is allowed to request in a single batched call. */
const ALLOWED_PREVIEW_BATCH_SIZES = [1, 4, 9];

async function requestGeneration(operation: GenerationOperation, item: QueueItem, batchSize = 1) {
  operation.cancellationMessage = undefined;
  const settings = operation.settings!;
  const signal = AbortSignal.any([
    operation.controller.signal,
    AbortSignal.timeout(settings.timeoutSeconds * 1000),
  ]);
  const provider = getGenerationProvider(settings.provider);
  const images = await provider.generate(settings, item, batchSize, signal, {
    ...operation.context,
    onCancellation: (message) => {
      operation.cancellationMessage = message;
    },
  });
  signal.throwIfAborted();
  return provider.id === 'automatic1111' &&
    operation.kind === 'preview' &&
    images.length > batchSize
    ? images.slice(-batchSize)
    : images;
}

async function processQueue(projectRoot: string, operation: GenerationOperation) {
  if (workerPromise) {
    return workerPromise;
  }

  workerPromise = (async () => {
    while (true) {
      if (queueStatus === 'aborted') {
        break;
      }

      if (queueStatus === 'paused') {
        await new Promise<void>((resolve) => {
          wakeWorker = resolve;
        });
        continue;
      }

      if (queueStatus !== 'running') {
        break;
      }

      const nextItem = queueItems.shift();
      if (!nextItem) {
        queueStatus = 'completed';
        activeJobLabel = null;
        break;
      }

      activeJobLabel = nextItem.summary;
      generationStatistics.startJob();

      try {
        const imageCount = await runTxt2ImgJob(projectRoot, nextItem, operation);
        generationStatistics.finishJob(imageCount);
      } catch (error) {
        generationStatistics.cancelJob();
        if (!operation.controller.signal.aborted) {
          lastError =
            operation.cancellationMessage ??
            (error instanceof Error ? error.message : 'Could not run generation job.');
        }
      } finally {
        if (!operation.controller.signal.aborted) runCompleted += 1;
      }
    }

    activeJobLabel = null;
  })().finally(() => {
    workerPromise = null;
    if (operation.controller.signal.aborted && operation.cancellationMessage)
      lastError = operation.cancellationMessage;
    finishOperation(operation);
  });

  return workerPromise;
}

function parseQueueItems(payload: unknown): QueueItem[] {
  const raw = payload as { items?: unknown };
  const items = Array.isArray(raw?.items) ? raw.items : null;
  if (!items || items.length === 0) {
    throw new Error('invalid_items');
  }

  const normalized: QueueItem[] = [];
  for (const [index, item] of items.entries()) {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`invalid_item_${index}`);
    }

    const typed = item as {
      id?: unknown;
      summary?: unknown;
      prompt?: unknown;
      negativePrompt?: unknown;
      model?: unknown;
      seed?: unknown;
    };

    const summary = typeof typed.summary === 'string' ? typed.summary.trim() : '';
    const prompt = typeof typed.prompt === 'string' ? typed.prompt.trim() : '';
    const negativePrompt =
      typeof typed.negativePrompt === 'string' ? typed.negativePrompt.trim() : '';

    if (!summary || !prompt) {
      throw new Error(`invalid_item_${index}`);
    }

    normalized.push({
      id:
        typeof typed.id === 'string' && typed.id.trim()
          ? typed.id.trim()
          : `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 9)}`,
      summary,
      prompt,
      negativePrompt,
      ...(typeof typed.model === 'string' && typed.model.trim()
        ? { model: typed.model.trim() }
        : {}),
      ...(typeof typed.seed === 'number' && Number.isFinite(typed.seed)
        ? { seed: typed.seed }
        : {}),
    });
  }

  return normalized;
}

function sendBodyParsingError(res: ServerResponse, error: unknown, fallbackMessage: string) {
  if (error instanceof RequestBodyTooLargeError) {
    sendJson(res, 413, { message: `Request body exceeds ${error.limitBytes} bytes.` });
    return;
  }

  sendJson(res, 400, { message: fallbackMessage });
}

async function handleStatus(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    res.end();
    return true;
  }

  sendJson(res, 200, buildStatusPayload());
  return true;
}

async function handleQueueAdd(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end();
    return true;
  }

  if (getActiveOperation()) {
    sendJson(res, 409, { message: 'Cannot add queue items while generation is active.' });
    return true;
  }

  try {
    const payload = await readRequestBody(req, { maxBytes: MAX_JSON_BODY_BYTES });
    const items = parseQueueItems(payload);

    if (getActiveOperation()) {
      sendJson(res, 409, { message: 'Cannot add queue items while generation is active.' });
      return true;
    }

    queueItems = [...queueItems, ...items];
    queueStatus = 'idle';
    runTotal = 0;
    runCompleted = 0;
    lastError = null;
    generationStatistics.reset();

    sendJson(res, 200, buildStatusPayload());
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) {
      sendJson(res, 400, {
        message: 'items must be a non-empty array with summary, prompt, and optional fields.',
      });
      return true;
    }

    sendBodyParsingError(res, error, 'Could not parse queue add payload.');
  }

  return true;
}

async function handleQueueClear(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end();
    return true;
  }

  if (getActiveOperation()) {
    sendJson(res, 409, { message: 'Cannot clear queue while generation is active.' });
    return true;
  }

  queueItems = [];
  queueStatus = 'idle';
  activeJobLabel = null;
  runTotal = 0;
  runCompleted = 0;
  lastError = null;
  generationStatistics.reset();

  sendJson(res, 200, buildStatusPayload());
  return true;
}

async function handleStart(req: IncomingMessage, res: ServerResponse, projectRoot: string) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end();
    return true;
  }

  if (queueStatus === 'running') {
    sendJson(res, 200, buildStatusPayload());
    return true;
  }

  if (queueStatus === 'paused') {
    queueStatus = 'running';
    wakePausedWorker();
    sendJson(res, 200, buildStatusPayload());
    return true;
  }

  if (queueItems.length === 0) {
    sendJson(res, 400, { message: 'Queue is empty.' });
    return true;
  }

  if (getActiveOperation()) {
    sendJson(res, 409, { message: 'Another generation or configuration operation is active.' });
    return true;
  }
  const operation = beginOperation('queue');
  try {
    const payload = await readRequestBody(req, { maxBytes: MAX_JSON_BODY_BYTES });
    const settings = await readGenerationSettings(projectRoot);
    assertSavedConnection(payload, settings);
    operation.settings = getActiveConnection(settings);
    operation.settings.apiUrl = validateApiUrl(operation.settings.apiUrl);
    const provider = getGenerationProvider(settings.provider);
    operation.context = await provider.prepare?.(
      operation.settings,
      projectRoot,
      queueItems,
      1,
      AbortSignal.any([
        operation.controller.signal,
        AbortSignal.timeout(operation.settings.timeoutSeconds * 1000),
      ])
    );
    operation.controller.signal.throwIfAborted();
    queueStatus = 'running';
    runTotal = queueItems.length;
    runCompleted = 0;
    lastError = null;
    generationStatistics.reset();
    void processQueue(projectRoot, operation);
    sendJson(res, 200, buildStatusPayload());
  } catch (error) {
    finishOperation(operation);
    sendJson(res, error instanceof SavedConnectionMismatchError ? 409 : 400, {
      message: error instanceof Error ? error.message : 'Generation preflight failed.',
    });
  }
  return true;
}

async function handlePause(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end();
    return true;
  }

  if (queueStatus !== 'running') {
    sendJson(res, 409, { message: 'Generation is not running.' });
    return true;
  }

  queueStatus = 'paused';
  sendJson(res, 200, buildStatusPayload());
  return true;
}

async function handleAbort(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end();
    return true;
  }

  const operation = getActiveOperation();
  if (!operation || operation.kind === 'configuration') {
    sendJson(res, 409, { message: 'Generation is not active.' });
    return true;
  }

  if (operation.kind === 'queue') {
    queueStatus = 'aborted';
    queueItems = [];
    activeJobLabel = null;
    runTotal = 0;
    runCompleted = 0;
    lastError = 'Aborted by user.';
    generationStatistics.cancelJob();
  }
  operation.controller.abort();
  wakePausedWorker();
  await operation.done;
  if (operation.cancellationMessage) lastError = operation.cancellationMessage;

  sendJson(res, 200, buildStatusPayload());
  return true;
}

async function handleOpenTodayOutput(
  req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string
) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end();
    return true;
  }

  try {
    const outputDir = await getCurrentOutputDir(projectRoot);
    await openFolderInFileExplorer(outputDir);
    sendJson(res, 200, { ok: true, outputDir });
  } catch {
    sendJson(res, 500, { message: 'Could not open output folder.' });
  }

  return true;
}

/** One-shot generation for the entry editor. Never touches the queue or the output folder. */
async function handlePreview(req: IncomingMessage, res: ServerResponse, projectRoot: string) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end();
    return true;
  }

  if (getActiveOperation()) {
    sendJson(res, 409, { message: 'Another generation request is already running.' });
    return true;
  }

  const operation = beginOperation('preview');
  const onClose = () => {
    if (!res.writableEnded) operation.controller.abort();
  };
  res.once('close', onClose);
  try {
    const payload = (await readRequestBody(req, { maxBytes: MAX_JSON_BODY_BYTES })) as {
      positive_prompt?: unknown;
      negative_prompt?: unknown;
      loras?: unknown;
      model?: unknown;
      seed?: unknown;
      batchSize?: unknown;
    };

    const globals = await loadGlobalPromptDefaults(projectRoot);
    const composed = composeGenerationPrompt(
      [
        {
          positive_prompt:
            typeof payload.positive_prompt === 'string' ? payload.positive_prompt : '',
          negative_prompt:
            typeof payload.negative_prompt === 'string' ? payload.negative_prompt : '',
          loras: typeof payload.loras === 'string' ? payload.loras : '',
          model: typeof payload.model === 'string' ? payload.model : '',
        },
      ],
      globals
    );

    if (!composed.prompt) {
      sendJson(res, 400, { message: 'A positive prompt is required to generate a preview.' });
      return true;
    }

    const batchSize =
      typeof payload.batchSize === 'number' &&
      ALLOWED_PREVIEW_BATCH_SIZES.includes(payload.batchSize)
        ? payload.batchSize
        : 1;

    const savedSettings = await readGenerationSettings(projectRoot);
    assertSavedConnection(payload, savedSettings);
    const settings = getActiveConnection(savedSettings);
    settings.apiUrl = validateApiUrl(settings.apiUrl);
    operation.settings = settings;
    const item = {
      id: 'preview',
      summary: 'Entry preview',
      prompt: composed.prompt,
      negativePrompt: composed.negativePrompt,
      ...(composed.model ? { model: composed.model } : {}),
      ...(typeof payload.seed === 'number' && Number.isFinite(payload.seed)
        ? { seed: payload.seed }
        : {}),
    };
    const provider = getGenerationProvider(settings.provider);
    operation.context = await provider.prepare?.(
      settings,
      projectRoot,
      [item],
      batchSize,
      AbortSignal.any([
        operation.controller.signal,
        AbortSignal.timeout(settings.timeoutSeconds * 1000),
      ])
    );
    const images = await requestGeneration(operation, item, batchSize).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : 'unknown error';
      throw new Error(
        reason === 'fetch failed'
          ? `Could not reach ${settings.provider} at ${settings.apiUrl}. Check the saved connection.`
          : reason
      );
    });

    sendJson(res, 200, {
      images: images.map((image) => image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')),
      prompt: composed.prompt,
      negativePrompt: composed.negativePrompt,
    });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      sendBodyParsingError(res, error, 'Could not parse preview payload.');
      return true;
    }

    sendJson(res, error instanceof SavedConnectionMismatchError ? 409 : 502, {
      message: error instanceof Error ? error.message : 'Could not generate preview image.',
    });
  } finally {
    res.removeListener('close', onClose);
    if (operation.controller.signal.aborted && operation.cancellationMessage)
      lastError = operation.cancellationMessage;
    finishOperation(operation);
  }

  return true;
}

export async function handleGenerationRequest(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  projectRoot: string
) {
  if (parsedUrl.pathname === GENERATION_STATUS_PATH) {
    return await handleStatus(req, res);
  }
  if (parsedUrl.pathname === GENERATION_QUEUE_ADD_PATH) {
    return await handleQueueAdd(req, res);
  }
  if (parsedUrl.pathname === GENERATION_QUEUE_CLEAR_PATH) {
    return await handleQueueClear(req, res);
  }
  if (parsedUrl.pathname === GENERATION_START_PATH) {
    return await handleStart(req, res, projectRoot);
  }
  if (parsedUrl.pathname === GENERATION_PAUSE_PATH) {
    return await handlePause(req, res);
  }
  if (parsedUrl.pathname === GENERATION_ABORT_PATH) {
    return await handleAbort(req, res);
  }
  if (parsedUrl.pathname === GENERATION_OPEN_OUTPUT_PATH) {
    return await handleOpenTodayOutput(req, res, projectRoot);
  }
  if (parsedUrl.pathname === GENERATION_PREVIEW_PATH) {
    return await handlePreview(req, res, projectRoot);
  }

  return false;
}
