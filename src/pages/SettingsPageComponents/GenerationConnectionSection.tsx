import { Cable, Dices, Moon, Save, Sun } from 'lucide-react';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { WorkflowField, WorkflowPreset } from '../../features/generation/comfyWorkflow';
import {
  getActiveConnection,
  normalizeGenerationSettings,
  parseProvider,
  toPersistedGenerationSettings,
  updateActiveConnection,
  type ConnectionProfile,
  type GenerationSettings,
} from '../../features/settings/generationSettings';
import { ComfyUiWorkflowSection } from './ComfyUiWorkflowSection';
import {
  downloadJsonFile,
  fetchGenerationModels,
  fetchJson,
  requestGenerationJson,
  saveJsonToProject,
} from './settingsApi';
import { REMOTE_JSON_PATHS } from './settingsConfig';

type Props = {
  section: 'connection' | 'appearance';
  generationSettings: GenerationSettings;
  setGenerationSettings: Dispatch<SetStateAction<GenerationSettings>>;
  isBusy: boolean;
};

export function GenerationConnectionSection({
  section,
  generationSettings,
  setGenerationSettings,
  isBusy,
}: Props) {
  const connection = getActiveConnection(generationSettings);
  const [saveStatus, setSaveStatus] = useState<
    Partial<Record<Props['section'], { message: string; isError: boolean }>>
  >({});
  const [savingSection, setSavingSection] = useState<Props['section'] | null>(null);
  const [models, setModels] = useState<Array<{ id: string; label: string }>>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    message: string;
    isError: boolean;
  } | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowPreset | null>(null);
  const workflowControls = (field: WorkflowField) =>
    connection.provider === 'comfyui' &&
    connection.workflowId !== 'builtin-txt2img' &&
    !workflow?.bindings[field]?.length;
  function updateConnection(update: Partial<ConnectionProfile>) {
    setGenerationSettings((current) => updateActiveConnection(current, update));
  }
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setLoadingModels(true);
      setModelError(null);
      setModels([]);
      try {
        const available = await fetchGenerationModels(
          connection.provider,
          connection.apiUrl,
          controller.signal,
          connection.workflowId
        );
        if (controller.signal.aborted) return;
        setModels(available);
        setGenerationSettings((current) =>
          current.provider === connection.provider &&
          getActiveConnection(current).apiUrl === connection.apiUrl &&
          getActiveConnection(current).workflowId === connection.workflowId
            ? updateActiveConnection(current, {
                model: getActiveConnection(current).model || available[0]?.id || '',
              })
            : current
        );
      } catch (error) {
        if (!controller.signal.aborted)
          setModelError(error instanceof Error ? error.message : 'Could not load models.');
      } finally {
        if (!controller.signal.aborted) setLoadingModels(false);
      }
    })();
    return () => controller.abort();
  }, [
    connection.provider,
    connection.apiUrl,
    connection.workflowId,
    workflow?.bindings.model,
    setGenerationSettings,
  ]);
  async function save() {
    if (savingSection) return;
    const targetSection = section;
    setSavingSection(targetSection);
    const next = normalizeGenerationSettings(generationSettings);
    try {
      const raw = await fetchJson<unknown>(REMOTE_JSON_PATHS.generationSettings, null);
      if (raw === null) throw new Error('Could not read the saved settings snapshot.');
      const snapshot = toPersistedGenerationSettings(normalizeGenerationSettings(raw));
      const draft = toPersistedGenerationSettings(next);
      const payload =
        targetSection === 'connection'
          ? { ...snapshot, connection: draft.connection }
          : { ...snapshot, generic: draft.generic };
      await saveJsonToProject(REMOTE_JSON_PATHS.generationSettings, payload);
      setSaveStatus((current) => ({
        ...current,
        [targetSection]: {
          message:
            targetSection === 'connection'
              ? 'Connection and generation settings saved.'
              : 'Appearance saved.',
          isError: false,
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save settings.';
      setSaveStatus((current) => ({ ...current, [targetSection]: { message, isError: true } }));
      if (!isBusy) downloadJsonFile('settings.json', toPersistedGenerationSettings(next));
    } finally {
      setSavingSection(null);
    }
  }
  return (
    <>
      <section className="settings-section" hidden={section !== 'connection'}>
        <div className="settings-header">
          <p className="panel-label">
            {connection.provider === 'comfyui' ? 'ComfyUI' : 'Automatic1111'}
          </p>
          <h2>Connection & generation</h2>
        </div>
        <fieldset
          className="settings-grid"
          disabled={isBusy || savingSection !== null || testing}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          <label className="field-group">
            <span className="field-label">Provider</span>
            <select
              className="text-input"
              value={connection.provider}
              onChange={(event) => {
                const provider = parseProvider(event.target.value);
                setGenerationSettings((current) => ({ ...current, provider }));
                setConnectionResult(null);
                setSaveStatus((current) => ({ ...current, connection: undefined }));
              }}
            >
              <option value="automatic1111">AUTOMATIC1111</option>
              <option value="comfyui">ComfyUI</option>
            </select>
          </label>
          <label className="field-group">
            <span className="field-label">API URL</span>
            <div className="inline-actions">
              <input
                className="text-input"
                type="url"
                value={connection.apiUrl}
                onChange={(event) => updateConnection({ apiUrl: event.target.value })}
                placeholder={
                  connection.provider === 'comfyui'
                    ? 'http://127.0.0.1:8188'
                    : 'http://127.0.0.1:7860'
                }
              />
              <button
                type="button"
                className="secondary-button"
                disabled={testing}
                onClick={async () => {
                  setTesting(true);
                  setConnectionResult(null);
                  try {
                    const result = await requestGenerationJson<{ models: unknown[] }>(
                      '/api/generation/connection/test',
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          provider: connection.provider,
                          apiUrl: connection.apiUrl,
                        }),
                      }
                    );
                    setConnectionResult({
                      message: `Connection OK - ${result.models.length} models found.`,
                      isError: false,
                    });
                  } catch (error) {
                    setConnectionResult({
                      message: error instanceof Error ? error.message : 'Connection failed.',
                      isError: true,
                    });
                  } finally {
                    setTesting(false);
                  }
                }}
              >
                <Cable size={16} />
                {testing ? 'Testing...' : 'Test connection'}
              </button>
            </div>
          </label>
          {connectionResult ? (
            <p
              role="status"
              className={`field-hint ${connectionResult.isError ? 'is-error' : 'is-success'}`}
            >
              {connectionResult.message}
            </p>
          ) : null}
          <label className="field-group">
            <span className="field-label">Model</span>
            <select
              className="text-input"
              disabled={workflowControls('model')}
              value={workflowControls('model') ? '' : connection.model}
              onChange={(event) => updateConnection({ model: event.target.value })}
            >
              <option value="">
                {workflowControls('model')
                  ? 'Workflow-controlled'
                  : loadingModels
                    ? 'Loading models...'
                    : 'Select a model'}
              </option>
              {connection.model && !models.some((model) => model.id === connection.model) ? (
                <option value={connection.model}>{connection.model}</option>
              ) : null}
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
            {modelError ? <span className="field-hint is-error">{modelError}</span> : null}
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
                min="-1"
                disabled={workflowControls('seed')}
                placeholder="Workflow-controlled"
                value={workflowControls('seed') ? '' : connection.seed}
                onChange={(event) => updateConnection({ seed: Number(event.target.value) })}
              />
              <button
                type="button"
                className="secondary-button"
                disabled={workflowControls('seed')}
                onClick={() => updateConnection({ seed: -1 })}
              >
                <Dices size={16} />
                Random
              </button>
            </div>
          </div>
          <div className="settings-grid generation-dimensions">
            {(['steps', 'width', 'height'] as const).map((field) => (
              <label className="field-group" key={field}>
                <span className="field-label">{field[0].toUpperCase() + field.slice(1)}</span>
                <input
                  className="text-input"
                  type="number"
                  disabled={workflowControls(field)}
                  placeholder="Workflow-controlled"
                  min={field === 'steps' ? 1 : 64}
                  step={field === 'steps' ? 1 : 64}
                  value={workflowControls(field) ? '' : connection[field]}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) {
                      const step = field === 'steps' ? 1 : 64;
                      updateConnection({
                        [field]: Math.max(step, Math.round(value / step) * step),
                      });
                    }
                  }}
                />
              </label>
            ))}
          </div>
          <label className="field-group">
            <span className="field-label">Timeout (seconds)</span>
            <input
              className="text-input"
              type="number"
              min="1"
              max="7200"
              value={connection.timeoutSeconds}
              onChange={(event) =>
                updateConnection({
                  timeoutSeconds: Math.min(7200, Math.max(1, Number(event.target.value))),
                })
              }
            />
          </label>
          {connection.provider === 'comfyui' ? (
            <ComfyUiWorkflowSection
              workflowId={connection.workflowId}
              onSelect={(workflowId) => updateConnection({ workflowId })}
              onWorkflowChange={setWorkflow}
            />
          ) : null}
          <div className="inline-actions">
            <button type="button" className="primary-button" onClick={() => void save()}>
              <Save size={16} />
              {savingSection === 'connection' ? 'Saving...' : 'Save connection settings'}
            </button>
          </div>
        </fieldset>
        {saveStatus.connection ? (
          <p
            role="status"
            className={`field-hint ${saveStatus.connection.isError ? 'is-error' : 'is-success'}`}
          >
            {saveStatus.connection.message}
          </p>
        ) : null}
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
              {(['light', 'dark'] as const).map((theme) => (
                <button
                  key={theme}
                  type="button"
                  className={
                    generationSettings.theme === theme ? 'toggle-button is-active' : 'toggle-button'
                  }
                  aria-pressed={generationSettings.theme === theme}
                  onClick={() => setGenerationSettings((current) => ({ ...current, theme }))}
                >
                  {theme === 'light' ? <Sun size={17} /> : <Moon size={17} />}
                  {theme === 'light' ? 'Light' : 'Dark'}
                </button>
              ))}
            </div>
            <div className="inline-actions">
              <button
                type="button"
                className="primary-button"
                disabled={savingSection !== null}
                onClick={() => void save()}
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
