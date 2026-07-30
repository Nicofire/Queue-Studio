export type GenerationStatus = 'idle' | 'running' | 'paused' | 'aborted' | 'completed';

export type GenerationQueueItemPayload = {
  id: string;
  summary: string;
  prompt: string;
  negativePrompt: string;
  model?: string;
  seed?: number;
};

export type GenerationQueueItemPreview = {
  id: string;
  summary: string;
};

export type GenerationStatusResponse = {
  status: GenerationStatus;
  queueLength: number;
  queuePreview: GenerationQueueItemPreview[];
  activeJobLabel: string | null;
  runTotal: number;
  runCompleted: number;
  lastError: string | null;
};

const GENERATION_STATUS_PATH = '/api/generation/status';
const GENERATION_QUEUE_ADD_PATH = '/api/generation/queue/add';
const GENERATION_QUEUE_CLEAR_PATH = '/api/generation/queue/clear';
const GENERATION_START_PATH = '/api/generation/start';
const GENERATION_PAUSE_PATH = '/api/generation/pause';
const GENERATION_ABORT_PATH = '/api/generation/abort';
const GENERATION_OPEN_OUTPUT_PATH = '/api/generation/output/open-today';

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) {
      return body.message;
    }
  } catch {
    // Keep fallback.
  }

  return fallback;
}

async function postJson(path: string, payload?: unknown) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Request failed (${response.status}).`));
  }

  return (await response.json()) as GenerationStatusResponse;
}

export async function getGenerationStatus(): Promise<GenerationStatusResponse> {
  const response = await fetch(GENERATION_STATUS_PATH);

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `Could not read generation status (${response.status}).`)
    );
  }

  return (await response.json()) as GenerationStatusResponse;
}

export async function addQueueToGeneration(
  items: GenerationQueueItemPayload[]
): Promise<GenerationStatusResponse> {
  return await postJson(GENERATION_QUEUE_ADD_PATH, { items });
}

export async function clearGenerationQueue(): Promise<GenerationStatusResponse> {
  return await postJson(GENERATION_QUEUE_CLEAR_PATH, {});
}

export async function startGeneration(): Promise<GenerationStatusResponse> {
  return await postJson(GENERATION_START_PATH, {});
}

export async function pauseGeneration(): Promise<GenerationStatusResponse> {
  return await postJson(GENERATION_PAUSE_PATH, {});
}

export async function abortGeneration(): Promise<GenerationStatusResponse> {
  return await postJson(GENERATION_ABORT_PATH, {});
}

export async function openCurrentOutputFolder(): Promise<void> {
  const response = await fetch(GENERATION_OPEN_OUTPUT_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `Could not open output folder (${response.status}).`)
    );
  }
}
