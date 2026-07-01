export type PromptPresetGroup = {
  selectedPreset: string
  presets: Record<string, string>
}

export type GenerationSettings = {
  apiUrl: string
  model: string
  seed: number
  theme: 'light' | 'dark'
}

export type SaveStatusHandlers = {
  setSaveResult: (message: string | null) => void
  setSaveError: (isError: boolean) => void
}
