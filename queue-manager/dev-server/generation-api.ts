import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

import { pathExists, readRequestBody, RequestBodyTooLargeError, sendJson } from './http-utils';

export const GENERATION_STATUS_PATH = '/api/generation/status';
export const GENERATION_QUEUE_ADD_PATH = '/api/generation/queue/add';
export const GENERATION_QUEUE_CLEAR_PATH = '/api/generation/queue/clear';
export const GENERATION_START_PATH = '/api/generation/start';
export const GENERATION_PAUSE_PATH = '/api/generation/pause';
export const GENERATION_ABORT_PATH = '/api/generation/abort';

const MAX_JSON_BODY_BYTES = 1_500_000;
const JOB_TIMEOUT_MS = 180_000;

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
  status: GenerationStatus;
  queueLength: number;
  queuePreview: QueueItemPreview[];
  activeJobLabel: string | null;
  runTotal: number;
  runCompleted: number;
  lastError: string | null;
};

type NormalizedSettings = {
  apiUrl: string;
  model: string;
  seed: number;
};

type Txt2ImgResponse = {
  images?: unknown;
};

let queueItems: QueueItem[] = [];
let queueStatus: GenerationStatus = 'idle';
let activeJobLabel: string | null = null;
let runTotal = 0;
let runCompleted = 0;
let lastError: string | null = null;
let workerPromise: Promise<void> | null = null;
let wakeWorker: (() => void) | null = null;
let activeRequestController: AbortController | null = null;

function normalizeApiUrl(apiUrl: string) {
  return apiUrl.trim().replace(/\/+$/, '');
}

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

async function saveGeneratedImages(projectRoot: string, item: QueueItem, images: string[]) {
  const outputDateDir = path.resolve(projectRoot, 'output', toLocalDateFolderName(new Date()));
  await mkdir(outputDateDir, { recursive: true });

  const safeIdPart = toSafeFileNamePart(item.id) || 'job';
  const timestampPart = Date.now();

  await Promise.all(
    images.map(async (rawImage, index) => {
      const { buffer, extension } = decodeBase64Image(rawImage);
      const fileName = `${safeIdPart}-${timestampPart}-${String(index + 1).padStart(2, '0')}${extension}`;
      const targetPath = path.resolve(outputDateDir, fileName);
      await writeFile(targetPath, buffer);
    })
  );
}

function buildStatusPayload(): StatusPayload {
  return {
    status: queueStatus,
    queueLength: queueItems.length,
    queuePreview: queueItems.map((item) => ({ id: item.id, summary: item.summary })),
    activeJobLabel,
    runTotal,
    runCompleted,
    lastError,
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

async function loadGenerationSettings(projectRoot: string): Promise<NormalizedSettings> {
  const dataSettingsPath = path.resolve(projectRoot, 'data', 'settings.json');
  const publicSettingsPath = path.resolve(projectRoot, 'public', 'settings.json');

  const settingsPath = (await pathExists(dataSettingsPath)) ? dataSettingsPath : publicSettingsPath;
  const settingsContent = await readFile(settingsPath, 'utf8');
  const parsed = JSON.parse(settingsContent.replace(/^\uFEFF/, '')) as
    | {
        connection?: {
          apiUrl?: unknown;
          model?: unknown;
          seed?: unknown;
        };
        apiUrl?: unknown;
        model?: unknown;
        seed?: unknown;
      }
    | undefined;

  const apiUrlRaw =
    typeof parsed?.connection?.apiUrl === 'string'
      ? parsed.connection.apiUrl
      : typeof parsed?.apiUrl === 'string'
        ? parsed.apiUrl
        : '';
  const modelRaw =
    typeof parsed?.connection?.model === 'string'
      ? parsed.connection.model
      : typeof parsed?.model === 'string'
        ? parsed.model
        : '';
  const seedRaw =
    typeof parsed?.connection?.seed === 'number'
      ? parsed.connection.seed
      : typeof parsed?.seed === 'number'
        ? parsed.seed
        : -1;

  const apiUrl = normalizeApiUrl(apiUrlRaw);
  if (!apiUrl) {
    throw new Error('Automatic1111 API URL is not configured in settings.json.');
  }

  return {
    apiUrl,
    model: modelRaw.trim(),
    seed: Number.isFinite(seedRaw) ? seedRaw : -1,
  };
}

async function runTxt2ImgJob(projectRoot: string, item: QueueItem) {
  const settings = await loadGenerationSettings(projectRoot);
  const modelOverride = item.model?.trim() || settings.model;
  const seed =
    typeof item.seed === 'number' && Number.isFinite(item.seed) ? item.seed : settings.seed;

  const payload = {
    prompt: item.prompt,
    negative_prompt: item.negativePrompt,
    seed,
    ...(modelOverride
      ? {
          override_settings: {
            sd_model_checkpoint: modelOverride,
          },
        }
      : {}),
  };

  const controller = new AbortController();
  activeRequestController = controller;
  const timeoutId = setTimeout(() => controller.abort(), JOB_TIMEOUT_MS);

  try {
    const response = await fetch(`${settings.apiUrl}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      let message = `Automatic1111 txt2img failed with status ${response.status}.`;
      try {
        const body = (await response.json()) as { message?: string; detail?: string };
        const remoteMessage =
          typeof body.message === 'string'
            ? body.message
            : typeof body.detail === 'string'
              ? body.detail
              : '';
        if (remoteMessage) {
          message = remoteMessage;
        }
      } catch {
        // Keep fallback message.
      }

      throw new Error(message);
    }

    const body = (await response.json()) as Txt2ImgResponse;
    const images = Array.isArray(body.images)
      ? body.images.filter(
          (image): image is string => typeof image === 'string' && image.trim().length > 0
        )
      : [];

    if (images.length === 0) {
      throw new Error('Automatic1111 response did not contain generated images.');
    }

    await saveGeneratedImages(projectRoot, item, images);
  } finally {
    clearTimeout(timeoutId);
    activeRequestController = null;
  }
}

async function processQueue(projectRoot: string) {
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

      try {
        await runTxt2ImgJob(projectRoot, nextItem);
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Could not run generation job.';
      } finally {
        runCompleted += 1;
      }
    }

    activeJobLabel = null;
  })().finally(() => {
    workerPromise = null;
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

  if (queueStatus === 'running' || queueStatus === 'paused') {
    sendJson(res, 409, { message: 'Cannot add queue items while generation is active.' });
    return true;
  }

  try {
    const payload = await readRequestBody(req, { maxBytes: MAX_JSON_BODY_BYTES });
    const items = parseQueueItems(payload);

    queueItems = [...queueItems, ...items];
    queueStatus = 'idle';
    runTotal = 0;
    runCompleted = 0;
    lastError = null;

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

  if (queueStatus === 'running' || queueStatus === 'paused') {
    sendJson(res, 409, { message: 'Cannot clear queue while generation is active.' });
    return true;
  }

  queueItems = [];
  queueStatus = 'idle';
  activeJobLabel = null;
  runTotal = 0;
  runCompleted = 0;
  lastError = null;

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

  queueStatus = 'running';
  runTotal = queueItems.length;
  runCompleted = 0;
  lastError = null;
  void processQueue(projectRoot);

  sendJson(res, 200, buildStatusPayload());
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

  if (queueStatus !== 'running' && queueStatus !== 'paused') {
    sendJson(res, 409, { message: 'Generation is not active.' });
    return true;
  }

  queueStatus = 'aborted';
  queueItems = [];
  activeJobLabel = null;
  runTotal = 0;
  runCompleted = 0;
  lastError = 'Aborted by user.';

  activeRequestController?.abort();
  activeRequestController = null;
  wakePausedWorker();

  sendJson(res, 200, buildStatusPayload());
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

  return false;
}
