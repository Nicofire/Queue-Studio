import { Cable, Dices, Moon, Save, Sun } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';

import {
  downloadJsonFile,
  fetchJson,
  fetchModelsViaProxy,
  fromPersistedGenerationSettings,
  normalizeApiUrl,
  saveJsonToProject,
  toPersistedGenerationSettings,
} from './settingsApi';
import { REMOTE_JSON_PATHS } from './settingsConfig';
import type {
  ConnectionSettings,
  GenerationSettings,
  GenericSettings,
  PersistedGenerationSettings,
} from './settingsTypes';

type Automatic1111ConnectionSectionProps = {
  section: 'connection' | 'appearance';
  generationSettings: GenerationSettings;
  setGenerationSettings: Dispatch<SetStateAction<GenerationSettings>>;
};

export function Automatic1111ConnectionSection({
  section,
  generationSettings,
  setGenerationSettings,
}: Automatic1111ConnectionSectionProps) {
  const [saveStatus, setSaveStatus] = useState<
    Partial<Record<'connection' | 'appearance', { message: string; isError: boolean }>>
  >({});
  const [savingSection, setSavingSection] = useState<'connection' | 'appearance' | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState(false);

  const normalizeGenerationNumber = (
    value: number,
    fallback: number,
    minimum: number,
    step = 1
  ) => {
    if (!Number.isFinite(value)) {
      return fallback;
    }

    const next = Math.max(minimum, Math.round(value / step) * step);
    return next;
  };

  function buildFallbackPersistedSettings(): PersistedGenerationSettings {
    return toPersistedGenerationSettings(generationSettings);
  }

  async function readPersistedSettingsSnapshot() {
    const payload = await fetchJson<unknown>(REMOTE_JSON_PATHS.generationSettings, null);
    const normalized = fromPersistedGenerationSettings(payload, generationSettings);
    return toPersistedGenerationSettings(normalized);
  }

  function saveGenerationSettings(
    nextSettings: GenerationSettings,
    updateSection: (current: PersistedGenerationSettings) => PersistedGenerationSettings,
    successMessage: string
  ) {
    if (savingSection) return;
    setSavingSection(section);
    void (async () => {
      try {
        const snapshot = await readPersistedSettingsSnapshot();
        const nextPayload = updateSection(snapshot);
        await saveJsonToProject(REMOTE_JSON_PATHS.generationSettings, nextPayload);
        setGenerationSettings(nextSettings);
        setSaveStatus((current) => ({
          ...current,
          [section]: { message: successMessage, isError: false },
        }));
      } catch (error) {
        setSaveStatus((current) => ({
          ...current,
          [section]: {
            message: error instanceof Error ? error.message : 'Could not save settings.',
            isError: true,
          },
        }));
        downloadJsonFile('settings.json', buildFallbackPersistedSettings());
      } finally {
        setSavingSection(null);
      }
    })();
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadModels() {
      if (!generationSettings.apiUrl.trim()) {
        setModelOptions([]);
        setModelError('Enter an API URL to load models.');
        return;
      }

      setIsLoadingModels(true);
      setModelError(null);

      try {
        const payload = await fetchModelsViaProxy(generationSettings.apiUrl, controller.signal);
        const availableModels = payload
          .map((entry) => entry.title ?? entry.model_name ?? '')
          .filter(Boolean);

        setModelOptions(availableModels);
        setGenerationSettings((current) => ({
          ...current,
          model: current.model || availableModels[0] || '',
        }));
      } catch (error) {
        if (!controller.signal.aborted) {
          setModelOptions([]);
          setModelError(
            error instanceof Error
              ? `Could not load models from Automatic1111: ${error.message}`
              : 'Could not load models from Automatic1111.'
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingModels(false);
        }
      }
    }

    void loadModels();

    return () => controller.abort();
  }, [generationSettings.apiUrl, setGenerationSettings]);

  return (
    <>
      <section className="settings-section" hidden={section !== 'connection'}>
        <div className="settings-header">
          <p className="panel-label">Automatic1111</p>
          <h2>Connection & generation</h2>
        </div>

        <div className="settings-grid">
          <label className="field-group">
            <span className="field-label">API URL</span>
            <div className="inline-actions">
              <input
                className="text-input"
                type="url"
                value={generationSettings.apiUrl}
                onChange={(event) =>
                  setGenerationSettings((current) => ({
                    ...current,
                    apiUrl: event.target.value,
                  }))
                }
                placeholder="http://127.0.0.1:7860"
              />
              <button
                type="button"
                className="secondary-button"
                onClick={async () => {
                  setIsTestingConnection(true);
                  setConnectionResult(null);
                  setConnectionError(false);

                  const url = normalizeApiUrl(generationSettings.apiUrl);
                  if (!url) {
                    setConnectionResult('Please enter an API URL first.');
                    setConnectionError(true);
                    setIsTestingConnection(false);
                    return;
                  }

                  try {
                    const payload = await fetchModelsViaProxy(url);
                    setConnectionResult(
                      payload.length > 0
                        ? `Connection OK — ${payload.length} models found.`
                        : 'Connection OK — models endpoint reachable (no models returned).'
                    );
                    setConnectionError(false);
                  } catch (err) {
                    setConnectionResult(
                      err instanceof Error
                        ? `Connection failed: ${err.message}`
                        : 'Connection failed'
                    );
                    setConnectionError(true);
                  } finally {
                    setIsTestingConnection(false);
                  }
                }}
                disabled={isTestingConnection}
              >
                <Cable size={16} />
                {isTestingConnection ? 'Testing...' : 'Test connection'}
              </button>
            </div>
            {connectionResult ? (
              <p className={`field-hint ${connectionError ? 'is-error' : 'is-success'}`}>
                {connectionResult}
              </p>
            ) : null}
          </label>

          <label className="field-group">
            <span className="field-label">Model</span>
            <select
              className="text-input"
              value={generationSettings.model}
              onChange={(event) =>
                setGenerationSettings((current) => ({
                  ...current,
                  model: event.target.value,
                }))
              }
            >
              <option value="" disabled>
                {isLoadingModels ? 'Loading models...' : 'Select a model'}
              </option>
              {modelOptions.map((modelName) => (
                <option key={modelName} value={modelName}>
                  {modelName}
                </option>
              ))}
            </select>
            {modelError ? <p className="field-hint is-error">{modelError}</p> : null}
          </label>

          <div className="field-group">
            <label className="field-label" htmlFor="generation-seed">
              Seed
            </label>
            <div className="seed-row">
              <input
                id="generation-seed"
                className="text-input seed-input"
                type="number"
                value={generationSettings.seed}
                onChange={(event) =>
                  setGenerationSettings((current) => ({
                    ...current,
                    seed: Number(event.target.value),
                  }))
                }
              />
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setGenerationSettings((current) => ({
                    ...current,
                    seed: -1,
                  }))
                }
              >
                <Dices size={16} /> Random
              </button>
            </div>
            <p className="field-hint">-1 means random seed in Automatic1111.</p>
          </div>

          <div className="settings-grid generation-dimensions">
            <label className="field-group">
              <span className="field-label">Steps</span>
              <input
                className="text-input"
                type="number"
                min="1"
                step="1"
                value={generationSettings.steps}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setGenerationSettings((current) => ({
                    ...current,
                    steps: normalizeGenerationNumber(nextValue, current.steps, 1, 1),
                  }));
                }}
              />
            </label>

            <label className="field-group">
              <span className="field-label">Width</span>
              <input
                className="text-input"
                type="number"
                min="64"
                step="64"
                value={generationSettings.width}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setGenerationSettings((current) => ({
                    ...current,
                    width: normalizeGenerationNumber(nextValue, current.width, 64, 64),
                  }));
                }}
              />
            </label>

            <label className="field-group">
              <span className="field-label">Height</span>
              <input
                className="text-input"
                type="number"
                min="64"
                step="64"
                value={generationSettings.height}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setGenerationSettings((current) => ({
                    ...current,
                    height: normalizeGenerationNumber(nextValue, current.height, 64, 64),
                  }));
                }}
              />
            </label>
          </div>

          <div className="field-group">
            <p className="field-hint">Width/Height are aligned to multiples of 64.</p>
            <div className="inline-actions">
              <button
                type="button"
                className="primary-button"
                disabled={savingSection !== null}
                onClick={() => {
                  const nextSettings = {
                    ...generationSettings,
                    apiUrl: generationSettings.apiUrl.trim(),
                  };

                  const nextConnection: ConnectionSettings = {
                    apiUrl: nextSettings.apiUrl,
                    model: nextSettings.model,
                    seed: nextSettings.seed,
                    steps: nextSettings.steps,
                    width: nextSettings.width,
                    height: nextSettings.height,
                  };

                  saveGenerationSettings(
                    nextSettings,
                    (current) => ({
                      ...current,
                      connection: nextConnection,
                    }),
                    'Connection and generation settings saved.'
                  );
                }}
              >
                <Save size={16} />
                {savingSection === 'connection' ? 'Saving...' : 'Save connection settings'}
              </button>
            </div>
            {saveStatus.connection ? (
              <p
                role="status"
                className={`field-hint ${saveStatus.connection.isError ? 'is-error' : 'is-success'}`}
              >
                {saveStatus.connection.message}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="settings-section" hidden={section !== 'appearance'}>
        <div className="settings-header">
          <p className="panel-label">Workspace</p>
          <h2>Appearance</h2>
        </div>

        <div className="settings-grid">
          <div className="field-group">
            <span className="field-label">Theme</span>
            <div className="theme-switcher" role="group" aria-label="Theme switcher">
              <button
                type="button"
                className={
                  generationSettings.theme === 'light' ? 'toggle-button is-active' : 'toggle-button'
                }
                aria-pressed={generationSettings.theme === 'light'}
                onClick={() =>
                  setGenerationSettings((current) => ({
                    ...current,
                    theme: 'light',
                  }))
                }
              >
                <Sun size={17} /> Light
              </button>
              <button
                type="button"
                className={
                  generationSettings.theme === 'dark' ? 'toggle-button is-active' : 'toggle-button'
                }
                aria-pressed={generationSettings.theme === 'dark'}
                onClick={() =>
                  setGenerationSettings((current) => ({
                    ...current,
                    theme: 'dark',
                  }))
                }
              >
                <Moon size={17} /> Dark
              </button>
            </div>
            <div className="inline-actions">
              <button
                type="button"
                className="primary-button"
                disabled={savingSection !== null}
                onClick={() => {
                  const nextSettings = {
                    ...generationSettings,
                    apiUrl: generationSettings.apiUrl.trim(),
                  };

                  const nextGeneric: GenericSettings = {
                    theme: nextSettings.theme,
                  };

                  saveGenerationSettings(
                    nextSettings,
                    (current) => ({
                      ...current,
                      generic: nextGeneric,
                    }),
                    'Appearance saved.'
                  );
                }}
              >
                <Save size={16} />
                {savingSection === 'appearance' ? 'Saving...' : 'Save appearance'}
              </button>
            </div>
            {saveStatus.appearance ? (
              <p
                role="status"
                className={`field-hint ${saveStatus.appearance.isError ? 'is-error' : 'is-success'}`}
              >
                {saveStatus.appearance.message}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}
