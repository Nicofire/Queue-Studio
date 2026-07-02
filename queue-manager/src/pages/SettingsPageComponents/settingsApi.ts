import { MODEL_PROXY_PATH } from './settingsConfig';
import type { GenerationSettings, PersistedGenerationSettings } from './settingsTypes';

export function readStoredJson<T>(key: string): T | undefined {
  const storedValue = localStorage.getItem(key);

  if (!storedValue) {
    return undefined;
  }

  try {
    return JSON.parse(storedValue) as T;
  } catch {
    return undefined;
  }
}

export async function fetchJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(path);

    if (!response.ok) {
      return fallback;
    }

    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export function normalizeApiUrl(apiUrl: string) {
  return apiUrl.trim().replace(/\/$/, '');
}

export async function fetchModelsViaProxy(apiUrl: string, signal?: AbortSignal) {
  const normalizedUrl = normalizeApiUrl(apiUrl);
  const response = await fetch(`${MODEL_PROXY_PATH}?baseUrl=${encodeURIComponent(normalizedUrl)}`, {
    signal,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload.message) {
        message = payload.message;
      }
    } catch {
      // Keep generic fallback message.
    }
    throw new Error(message);
  }

  return (await response.json()) as Array<{ title?: string; model_name?: string }>;
}

export function downloadJsonFile(fileName: string, payload: unknown) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(url);
}

export async function saveJsonToProject(path: string, payload: unknown): Promise<void> {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Save failed with status ${response.status}`);
  }
}

export function toPersistedGenerationSettings(
  settings: GenerationSettings
): PersistedGenerationSettings {
  return {
    connection: {
      apiUrl: settings.apiUrl,
      model: settings.model,
      seed: settings.seed,
    },
    generic: {
      theme: settings.theme,
    },
  };
}

export function fromPersistedGenerationSettings(
  payload: unknown,
  fallback: GenerationSettings
): GenerationSettings {
  const safe = payload as
    | {
        connection?: {
          apiUrl?: unknown;
          model?: unknown;
          seed?: unknown;
        };
        generic?: {
          theme?: unknown;
        };
        apiUrl?: unknown;
        model?: unknown;
        seed?: unknown;
        theme?: unknown;
      }
    | undefined;

  const hasSplitShape = Boolean(safe?.connection || safe?.generic);

  if (hasSplitShape) {
    const rawTheme = safe?.generic?.theme;
    return {
      apiUrl:
        typeof safe?.connection?.apiUrl === 'string' ? safe.connection.apiUrl : fallback.apiUrl,
      model: typeof safe?.connection?.model === 'string' ? safe.connection.model : fallback.model,
      seed: typeof safe?.connection?.seed === 'number' ? safe.connection.seed : fallback.seed,
      theme: rawTheme === 'dark' || rawTheme === 'light' ? rawTheme : fallback.theme,
    };
  }

  const rawTheme = safe?.theme;
  return {
    apiUrl: typeof safe?.apiUrl === 'string' ? safe.apiUrl : fallback.apiUrl,
    model: typeof safe?.model === 'string' ? safe.model : fallback.model,
    seed: typeof safe?.seed === 'number' ? safe.seed : fallback.seed,
    theme: rawTheme === 'dark' || rawTheme === 'light' ? rawTheme : fallback.theme,
  };
}
