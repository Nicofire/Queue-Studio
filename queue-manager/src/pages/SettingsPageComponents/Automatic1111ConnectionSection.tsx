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
  SaveStatusHandlers,
} from './settingsTypes';

type Automatic1111ConnectionSectionProps = SaveStatusHandlers & {
  generationSettings: GenerationSettings;
  setGenerationSettings: Dispatch<SetStateAction<GenerationSettings>>;
  saveResult: string | null;
  saveError: boolean;
};

export function Automatic1111ConnectionSection({
  generationSettings,
  setGenerationSettings,
  saveResult,
  saveError,
  setSaveResult,
  setSaveError,
}: Automatic1111ConnectionSectionProps) {
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState(false);

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
    void (async () => {
      try {
        const snapshot = await readPersistedSettingsSnapshot();
        const nextPayload = updateSection(snapshot);
        await saveJsonToProject(REMOTE_JSON_PATHS.generationSettings, nextPayload);
        setGenerationSettings(nextSettings);
        setSaveResult(successMessage);
        setSaveError(false);
      } catch (error) {
        setSaveResult(
          error instanceof Error
            ? `${successMessage} fehlgeschlagen: ${error.message}`
            : `${successMessage} fehlgeschlagen.`
        );
        setSaveError(true);
        downloadJsonFile('settings.json', buildFallbackPersistedSettings());
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
      <section className="settings-section">
        <div className="settings-header">
          <p className="panel-label">Generation settings</p>
          <h2>Automatic1111 connection</h2>
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
                {isTestingConnection ? 'Testing…' : 'Test Connection'}
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
            <span className="field-label">Seed</span>
            <div className="seed-row">
              <input
                className="seed-slider"
                type="range"
                min="-1"
                max="2147483647"
                step="1"
                value={generationSettings.seed}
                onChange={(event) =>
                  setGenerationSettings((current) => ({
                    ...current,
                    seed: Number(event.target.value),
                  }))
                }
              />
              <input
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
                Random (-1)
              </button>
            </div>
            <p className="field-hint">-1 means random seed in Automatic1111.</p>
            <div className="inline-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  const nextSettings = {
                    ...generationSettings,
                    apiUrl: generationSettings.apiUrl.trim(),
                  };

                  const nextConnection: ConnectionSettings = {
                    apiUrl: nextSettings.apiUrl,
                    model: nextSettings.model,
                    seed: nextSettings.seed,
                  };

                  saveGenerationSettings(
                    nextSettings,
                    (current) => ({
                      ...current,
                      connection: nextConnection,
                    }),
                    'Connection settings wurden im Projektordner gespeichert.'
                  );
                }}
              >
                Save connection settings
              </button>
            </div>
            {saveResult ? (
              <p className={`field-hint ${saveError ? 'is-error' : 'is-success'}`}>{saveResult}</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-header">
          <p className="panel-label">Settings</p>
          <h2>Generic settings</h2>
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
                onClick={() =>
                  setGenerationSettings((current) => ({
                    ...current,
                    theme: 'light',
                  }))
                }
              >
                Light
              </button>
              <button
                type="button"
                className={
                  generationSettings.theme === 'dark' ? 'toggle-button is-active' : 'toggle-button'
                }
                onClick={() =>
                  setGenerationSettings((current) => ({
                    ...current,
                    theme: 'dark',
                  }))
                }
              >
                Dark
              </button>
            </div>
            <p className="field-hint">Theme preference is stored in settings.json.</p>
            <div className="inline-actions">
              <button
                type="button"
                className="secondary-button"
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
                    'Generic settings wurden im Projektordner gespeichert.'
                  );
                }}
              >
                Save generic settings
              </button>
            </div>
            {saveResult ? (
              <p className={`field-hint ${saveError ? 'is-error' : 'is-success'}`}>{saveResult}</p>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}
