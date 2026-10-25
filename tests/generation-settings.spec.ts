import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_GENERATION_SETTINGS,
  getActiveConnection,
  normalizeGenerationSettings,
  toPersistedGenerationSettings,
  updateActiveConnection,
  validateApiUrl,
} from '../src/features/settings/generationSettings';

test('legacy connection settings migrate without changing A1111 or theme', () => {
  for (const payload of [
    {
      connection: { apiUrl: 'http://localhost:7860/', model: 'legacy', seed: 42 },
      generic: { theme: 'dark' },
    },
    { apiUrl: 'http://localhost:7860/', model: 'legacy', seed: 42, theme: 'dark' },
  ]) {
    const settings = normalizeGenerationSettings(payload);
    expect(settings.provider).toBe('automatic1111');
    expect(settings.theme).toBe('dark');
    expect(getActiveConnection(settings)).toMatchObject({
      apiUrl: 'http://localhost:7860',
      model: 'legacy',
      seed: 42,
    });
    expect(settings.profiles.comfyui.apiUrl).toBe('http://127.0.0.1:8188');
  }
});

test('provider profiles survive switching and persisted round trips', () => {
  let settings = updateActiveConnection(structuredClone(DEFAULT_GENERATION_SETTINGS), {
    model: 'a1111',
  });
  settings = updateActiveConnection(
    { ...settings, provider: 'comfyui' },
    { model: 'comfy', seed: 100 }
  );
  const restored = normalizeGenerationSettings(toPersistedGenerationSettings(settings));
  expect(getActiveConnection(restored)).toMatchObject({
    provider: 'comfyui',
    model: 'comfy',
    seed: 100,
  });
  expect(restored.profiles.automatic1111.model).toBe('a1111');
  expect(DEFAULT_GENERATION_SETTINGS.profiles.automatic1111.model).toBe('');
});

test('unknown providers and incomplete new schemas do not fall back silently', () => {
  expect(() =>
    normalizeGenerationSettings({ connection: { provider: 'other', profiles: {} } })
  ).toThrow('Unknown');
  expect(() =>
    normalizeGenerationSettings({ schemaVersion: 2, connection: { provider: 'comfyui' } })
  ).toThrow('profiles');
  expect(() => normalizeGenerationSettings({ schemaVersion: 3 })).toThrow('schema');
  const invalid = toPersistedGenerationSettings(DEFAULT_GENERATION_SETTINGS);
  expect(() =>
    normalizeGenerationSettings({
      ...invalid,
      connection: {
        ...invalid.connection,
        profiles: { ...invalid.connection.profiles, comfyui: 'invalid' },
      },
    })
  ).toThrow('profile');
  expect(
    normalizeGenerationSettings(
      { connection: { apiUrl: 'http://localhost:7860' } },
      { ...DEFAULT_GENERATION_SETTINGS, provider: 'comfyui' }
    ).provider
  ).toBe('automatic1111');
});

test('generation parameters are finite and aligned', () => {
  const settings = normalizeGenerationSettings({
    connection: { width: 513, height: 0, steps: -1, seed: NaN },
  });
  expect(getActiveConnection(settings)).toMatchObject({
    width: 512,
    height: 64,
    steps: 1,
    seed: -1,
  });
});

test('connection URL validation allows local HTTP APIs but not other protocols or credentials', () => {
  expect(validateApiUrl('http://127.0.0.1:8188/')).toBe('http://127.0.0.1:8188');
  for (const url of [
    'file:///tmp/api',
    'http://user:secret@localhost',
    'http://localhost/?key=secret',
  ]) {
    expect(() => validateApiUrl(url)).toThrow();
  }
});

test('shipped settings and shared profile defaults use the same versioned contract', async () => {
  const defaults: unknown = JSON.parse(
    await readFile(new URL('../public/settings.json', import.meta.url), 'utf8')
  );
  expect(normalizeGenerationSettings(defaults)).toEqual(DEFAULT_GENERATION_SETTINGS);
});
