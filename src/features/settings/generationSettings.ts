export type ProviderId = 'automatic1111' | 'comfyui';

export type ConnectionProfile = {
  apiUrl: string;
  model: string;
  seed: number;
  steps: number;
  width: number;
  height: number;
  timeoutSeconds: number;
  workflowId: string;
};

export type GenerationSettings = {
  provider: ProviderId;
  profiles: Record<ProviderId, ConnectionProfile>;
  theme: 'light' | 'dark';
};

export type PersistedGenerationSettings = {
  schemaVersion: 2;
  connection: Pick<GenerationSettings, 'provider' | 'profiles'>;
  generic: Pick<GenerationSettings, 'theme'>;
};

const baseProfile: ConnectionProfile = {
  apiUrl: 'http://127.0.0.1:7860',
  model: '',
  seed: -1,
  steps: 30,
  width: 1024,
  height: 1024,
  timeoutSeconds: 180,
  workflowId: 'builtin-txt2img',
};

export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  provider: 'automatic1111',
  profiles: {
    automatic1111: { ...baseProfile },
    comfyui: { ...baseProfile, apiUrl: 'http://127.0.0.1:8188', timeoutSeconds: 900 },
  },
  theme: 'light',
};

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseProvider(value: unknown): ProviderId {
  if (value === 'automatic1111' || value === 'comfyui') return value;
  throw new Error('Unknown generation provider. Select AUTOMATIC1111 or ComfyUI.');
}

function normalizeProfile(value: unknown, fallback: ConnectionProfile): ConnectionProfile {
  const source = asRecord(value);
  const number = (key: keyof ConnectionProfile, minimum: number, step = 1) => {
    const candidate = source[key];
    return typeof candidate === 'number' && Number.isFinite(candidate)
      ? Math.max(minimum, Math.round(candidate / step) * step)
      : (fallback[key] as number);
  };
  return {
    apiUrl:
      typeof source.apiUrl === 'string'
        ? source.apiUrl.trim().replace(/\/+$/, '')
        : fallback.apiUrl,
    model: typeof source.model === 'string' ? source.model.trim() : fallback.model,
    seed: number('seed', -1),
    steps: number('steps', 1),
    width: number('width', 64, 64),
    height: number('height', 64, 64),
    timeoutSeconds: Math.min(7200, number('timeoutSeconds', 1)),
    workflowId: typeof source.workflowId === 'string' ? source.workflowId : fallback.workflowId,
  };
}

export function normalizeGenerationSettings(
  value: unknown,
  fallback = DEFAULT_GENERATION_SETTINGS
): GenerationSettings {
  const source = asRecord(value);
  const connection = asRecord(source.connection ?? source);
  const generic = asRecord(source.generic ?? source);
  const theme =
    generic.theme === 'dark' || generic.theme === 'light' ? generic.theme : fallback.theme;
  if (source.schemaVersion !== undefined && source.schemaVersion !== 2) {
    throw new Error('Unsupported settings schema version.');
  }
  if (
    connection.provider !== undefined ||
    connection.profiles !== undefined ||
    source.schemaVersion === 2
  ) {
    const provider = parseProvider(connection.provider);
    const profiles = asRecord(connection.profiles);
    if (!profiles.automatic1111 || !profiles.comfyui) {
      throw new Error('Both generation connection profiles are required.');
    }
    for (const [id, value] of Object.entries(profiles)) {
      if (id !== 'automatic1111' && id !== 'comfyui')
        throw new Error(`Unknown connection profile: ${id}.`);
      const profile = asRecord(value);
      if (
        typeof profile.apiUrl !== 'string' ||
        typeof profile.model !== 'string' ||
        typeof profile.workflowId !== 'string' ||
        ['seed', 'steps', 'width', 'height', 'timeoutSeconds'].some(
          (key) => typeof profile[key] !== 'number' || !Number.isFinite(profile[key])
        )
      ) {
        throw new Error(`Invalid ${id} connection profile.`);
      }
    }
    return {
      provider,
      profiles: {
        automatic1111: normalizeProfile(
          profiles.automatic1111,
          fallback.profiles.automatic1111
        ),
        comfyui: normalizeProfile(profiles.comfyui, fallback.profiles.comfyui),
      },
      theme,
    };
  }
  return {
    provider:
      source.connection !== undefined ||
      ['apiUrl', 'model', 'seed', 'steps', 'width', 'height'].some((key) =>
        Object.hasOwn(connection, key)
      )
        ? 'automatic1111'
        : fallback.provider,
    profiles: {
      automatic1111: normalizeProfile(connection, fallback.profiles.automatic1111),
      comfyui: { ...fallback.profiles.comfyui },
    },
    theme,
  };
}

export function toPersistedGenerationSettings(
  settings: GenerationSettings
): PersistedGenerationSettings {
  return {
    schemaVersion: 2,
    connection: { provider: settings.provider, profiles: structuredClone(settings.profiles) },
    generic: { theme: settings.theme },
  };
}

export function getActiveConnection(settings: GenerationSettings) {
  return { ...settings.profiles[settings.provider], provider: settings.provider };
}

export function updateActiveConnection(
  settings: GenerationSettings,
  update: Partial<ConnectionProfile>
): GenerationSettings {
  return {
    ...settings,
    profiles: {
      ...settings.profiles,
      [settings.provider]: { ...settings.profiles[settings.provider], ...update },
    },
  };
}

export function validateApiUrl(value: string) {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('Use an HTTP(S) API URL without credentials, query, or fragment.');
  }
  return url.toString().replace(/\/+$/, '');
}
