import { useEffect, useMemo, useState } from 'react'

type PromptPresetGroup = {
  selectedPreset: string
  presets: Record<string, string>
}

type GenerationSettings = {
  apiUrl: string
  model: string
  seed: number
  theme: 'light' | 'dark'
}

const STORAGE_KEYS = {
  positivePresets: 'queue-manager.positive-presets',
  negativePresets: 'queue-manager.negative-presets',
  generationSettings: 'queue-manager.generation-settings',
} as const

const DEFAULT_POSITIVE_PRESETS: PromptPresetGroup = {
  selectedPreset: 'Default Positive',
  presets: {
    'Default Positive': 'high quality, detailed, sharp focus, best composition',
    Cinematic: 'cinematic lighting, dramatic scene, film still, rich contrast',
    Portrait: 'portrait, soft lighting, natural skin tones, clear facial details',
  },
}

const DEFAULT_NEGATIVE_PRESETS: PromptPresetGroup = {
  selectedPreset: 'Default Negative',
  presets: {
    'Default Negative': 'low quality, blurry, noisy, watermark, text, cropped',
    Anime: 'bad anatomy, extra fingers, deformed hands, low detail',
    Photo: 'motion blur, overexposed, underexposed, bad framing',
  },
}

const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  apiUrl: 'http://127.0.0.1:7860',
  model: '',
  seed: -1,
  theme: 'light',
}

const MODEL_REQUEST_PATH = '/sdapi/v1/sd-models'
const REMOTE_JSON_PATHS = {
  positivePresets: '/positive-presets.json',
  negativePresets: '/negative-presets.json',
  generationSettings: '/settings.json',
} as const

function readStoredJson<T>(key: string): T | undefined {
  const storedValue = localStorage.getItem(key)

  if (!storedValue) {
    return undefined
  }

  try {
    return JSON.parse(storedValue) as T
  } catch {
    return undefined
  }
}

async function fetchJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(path)

    if (!response.ok) {
      return fallback
    }

    return (await response.json()) as T
  } catch {
    return fallback
  }
}

function normalizeApiUrl(apiUrl: string) {
  return apiUrl.trim().replace(/\/$/, '')
}

function downloadJsonFile(fileName: string, payload: unknown) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = fileName
  link.click()

  URL.revokeObjectURL(url)
}

export function SettingsPage() {
  const [positivePresetGroup, setPositivePresetGroup] = useState<PromptPresetGroup>(
    DEFAULT_POSITIVE_PRESETS,
  )
  const [negativePresetGroup, setNegativePresetGroup] = useState<PromptPresetGroup>(
    DEFAULT_NEGATIVE_PRESETS,
  )
  const [generationSettings, setGenerationSettings] = useState<GenerationSettings>(
    DEFAULT_GENERATION_SETTINGS,
  )
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [modelError, setModelError] = useState<string | null>(null)
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [connectionResult, setConnectionResult] = useState<string | null>(null)
  const [connectionError, setConnectionError] = useState(false)
  const [hasHydratedSettings, setHasHydratedSettings] = useState(false)
  const [positiveDraft, setPositiveDraft] = useState(
    positivePresetGroup.presets[positivePresetGroup.selectedPreset],
  )
  const [negativeDraft, setNegativeDraft] = useState(
    negativePresetGroup.presets[negativePresetGroup.selectedPreset],
  )

  const positivePresetNames = useMemo(
    () => Object.keys(positivePresetGroup.presets),
    [positivePresetGroup.presets],
  )
  const negativePresetNames = useMemo(
    () => Object.keys(negativePresetGroup.presets),
    [negativePresetGroup.presets],
  )

  useEffect(() => {
    void (async () => {
      const [storedPositivePresets, storedNegativePresets, storedGenerationSettings] = [
        readStoredJson<PromptPresetGroup>(STORAGE_KEYS.positivePresets),
        readStoredJson<PromptPresetGroup>(STORAGE_KEYS.negativePresets),
        readStoredJson<GenerationSettings>(STORAGE_KEYS.generationSettings),
      ]

      const [remotePositivePresets, remoteNegativePresets, remoteGenerationSettings] = await Promise.all([
        fetchJson<PromptPresetGroup>(REMOTE_JSON_PATHS.positivePresets, DEFAULT_POSITIVE_PRESETS),
        fetchJson<PromptPresetGroup>(REMOTE_JSON_PATHS.negativePresets, DEFAULT_NEGATIVE_PRESETS),
        fetchJson<GenerationSettings>(REMOTE_JSON_PATHS.generationSettings, DEFAULT_GENERATION_SETTINGS),
      ])

      const nextPositivePresets = storedPositivePresets ?? remotePositivePresets
      const nextNegativePresets = storedNegativePresets ?? remoteNegativePresets
      const nextGenerationSettings = storedGenerationSettings ?? remoteGenerationSettings

      setPositivePresetGroup(nextPositivePresets)
      setNegativePresetGroup(nextNegativePresets)
      setGenerationSettings(nextGenerationSettings)
      setHasHydratedSettings(true)
    })()
  }, [])

  useEffect(() => {
    setPositiveDraft(positivePresetGroup.presets[positivePresetGroup.selectedPreset] ?? '')
  }, [positivePresetGroup.presets, positivePresetGroup.selectedPreset])

  useEffect(() => {
    setNegativeDraft(negativePresetGroup.presets[negativePresetGroup.selectedPreset] ?? '')
  }, [negativePresetGroup.presets, negativePresetGroup.selectedPreset])

  useEffect(() => {
    if (!hasHydratedSettings) {
      return
    }

    localStorage.setItem(
      STORAGE_KEYS.positivePresets,
      JSON.stringify(positivePresetGroup),
    )
  }, [hasHydratedSettings, positivePresetGroup])

  useEffect(() => {
    if (!hasHydratedSettings) {
      return
    }

    localStorage.setItem(
      STORAGE_KEYS.negativePresets,
      JSON.stringify(negativePresetGroup),
    )
  }, [hasHydratedSettings, negativePresetGroup])

  useEffect(() => {
    if (!hasHydratedSettings) {
      return
    }

    localStorage.setItem(
      STORAGE_KEYS.generationSettings,
      JSON.stringify(generationSettings),
    )
  }, [hasHydratedSettings, generationSettings])

  useEffect(() => {
    document.documentElement.dataset.theme = generationSettings.theme
  }, [generationSettings.theme])

  useEffect(() => {
    const controller = new AbortController()

    async function loadModels() {
      if (!generationSettings.apiUrl.trim()) {
        setModelOptions([])
        setModelError('Enter an API URL to load models.')
        return
      }

      setIsLoadingModels(true)
      setModelError(null)

      try {
        const response = await fetch(
          `${normalizeApiUrl(generationSettings.apiUrl)}${MODEL_REQUEST_PATH}`,
          { signal: controller.signal },
        )

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`)
        }

        const payload = (await response.json()) as Array<{ title?: string; model_name?: string }>
        const availableModels = payload
          .map((entry) => entry.title ?? entry.model_name ?? '')
          .filter(Boolean)

        setModelOptions(availableModels)
        setGenerationSettings((current) => ({
          ...current,
          model: current.model || availableModels[0] || '',
        }))
      } catch (error) {
        if (!controller.signal.aborted) {
          setModelOptions([])
          setModelError(
            error instanceof Error
              ? `Could not load models from Automatic1111: ${error.message}`
              : 'Could not load models from Automatic1111.',
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingModels(false)
        }
      }
    }

    void loadModels()

    return () => controller.abort()
  }, [generationSettings.apiUrl])

  return (
    <div className="settings-page">
      <section className="settings-section">
        <div className="settings-header">
          <p className="panel-label">Settings</p>
          <h2>Prompt presets</h2>
        </div>
        <p className="subtitle">
          Die JSON-Dateien aus `public/` werden beim Start geladen. Speichern exportiert die aktuelle
          Version als Download.
        </p>

        <div className="settings-grid two-columns">
          <PromptPresetEditor
            title="Positive prompt preset"
            presetNames={positivePresetNames}
            selectedPreset={positivePresetGroup.selectedPreset}
            value={positiveDraft}
            onPresetChange={(presetName) =>
              setPositivePresetGroup((current) => ({
                ...current,
                selectedPreset: presetName,
              }))
            }
            onValueChange={setPositiveDraft}
            onSave={() => {
              const nextPresetGroup = {
                ...positivePresetGroup,
                presets: {
                  ...positivePresetGroup.presets,
                  [positivePresetGroup.selectedPreset]: positiveDraft,
                },
              }

              setPositivePresetGroup(nextPresetGroup)
              downloadJsonFile('positive-presets.json', nextPresetGroup)
            }}
          />

          <PromptPresetEditor
            title="Negative prompt preset"
            presetNames={negativePresetNames}
            selectedPreset={negativePresetGroup.selectedPreset}
            value={negativeDraft}
            onPresetChange={(presetName) =>
              setNegativePresetGroup((current) => ({
                ...current,
                selectedPreset: presetName,
              }))
            }
            onValueChange={setNegativeDraft}
            onSave={() => {
              const nextPresetGroup = {
                ...negativePresetGroup,
                presets: {
                  ...negativePresetGroup.presets,
                  [negativePresetGroup.selectedPreset]: negativeDraft,
                },
              }

              setNegativePresetGroup(nextPresetGroup)
              downloadJsonFile('negative-presets.json', nextPresetGroup)
            }}
          />
        </div>
      </section>

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
                onClick={() => {
                  const nextSettings = {
                    ...generationSettings,
                    apiUrl: generationSettings.apiUrl.trim(),
                  }

                  setGenerationSettings(nextSettings)
                  downloadJsonFile('settings.json', nextSettings)
                }}
              >
                Save URL
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={async () => {
                  setIsTestingConnection(true)
                  setConnectionResult(null)
                  setConnectionError(false)

                  const url = normalizeApiUrl(generationSettings.apiUrl)
                  if (!url) {
                    setConnectionResult('Please enter an API URL first.')
                    setConnectionError(true)
                    setIsTestingConnection(false)
                    return
                  }

                  try {
                    const resp = await fetch(`${url}${MODEL_REQUEST_PATH}`)
                    if (!resp.ok) {
                      throw new Error(`Status ${resp.status}`)
                    }
                    setConnectionResult('Connection OK — models endpoint reachable.')
                    setConnectionError(false)
                  } catch (err) {
                    setConnectionResult(
                      err instanceof Error ? `Connection failed: ${err.message}` : 'Connection failed',
                    )
                    setConnectionError(true)
                  } finally {
                    setIsTestingConnection(false)
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
          </div>

          <div className="settings-grid theme-row">
            <div className="field-group">
              <span className="field-label">Theme</span>
              <div className="theme-switcher" role="group" aria-label="Theme switcher">
                <button
                  type="button"
                  className={generationSettings.theme === 'light' ? 'toggle-button is-active' : 'toggle-button'}
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
                  className={generationSettings.theme === 'dark' ? 'toggle-button is-active' : 'toggle-button'}
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
              <p className="field-hint">Theme preference is stored in config.json.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

type PromptPresetEditorProps = {
  title: string
  presetNames: string[]
  selectedPreset: string
  value: string
  onPresetChange: (presetName: string) => void
  onValueChange: (value: string) => void
  onSave: () => void
}

function PromptPresetEditor({
  title,
  presetNames,
  selectedPreset,
  value,
  onPresetChange,
  onValueChange,
  onSave,
}: PromptPresetEditorProps) {
  return (
    <div className="preset-card">
      <h3>{title}</h3>
      <label className="field-group">
        <span className="field-label">Preset</span>
        <select
          className="text-input"
          value={selectedPreset}
          onChange={(event) => onPresetChange(event.target.value)}
        >
          {presetNames.map((presetName) => (
            <option key={presetName} value={presetName}>
              {presetName}
            </option>
          ))}
        </select>
      </label>

      <label className="field-group">
        <span className="field-label">Prompt preset text</span>
        <textarea
          className="text-area"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          rows={8}
        />
      </label>

      <div className="card-actions">
        <button type="button" className="primary-button" onClick={onSave}>
          Save preset
        </button>
        <p className="field-hint">Speichert im Browser und lädt die passende JSON-Datei herunter.</p>
      </div>
    </div>
  )
}