import type { ProviderId } from '../../features/settings/generationSettings';
import { MODEL_PROXY_PATH } from './settingsConfig';
export {
  normalizeGenerationSettings as fromPersistedGenerationSettings,
  toPersistedGenerationSettings,
} from '../../features/settings/generationSettings';

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
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Save failed with status ${response.status}`);
  }
}

export async function requestGenerationJson<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(path, options);
  const body: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      (body as { message?: string }).message ?? `Request failed (${response.status}).`
    );
  return body as T;
}

export function fetchGenerationModels(
  provider: ProviderId,
  apiUrl: string,
  signal?: AbortSignal,
  workflowId?: string
) {
  const query = new URLSearchParams({ provider, baseUrl: normalizeApiUrl(apiUrl) });
  if (provider === 'comfyui' && workflowId) query.set('workflowId', workflowId);
  return requestGenerationJson<Array<{ id: string; label: string }>>(
    `/api/generation/models?${query}`,
    { signal }
  );
}
