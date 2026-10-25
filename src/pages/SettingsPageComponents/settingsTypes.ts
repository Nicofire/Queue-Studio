export type PromptPresetGroup = {
  selectedPreset: string;
  presets: Record<string, string>;
};

export type GenerationSettings = {
  apiUrl: string;
  model: string;
  seed: number;
  steps: number;
  width: number;
  height: number;
  theme: 'light' | 'dark';
};

export type ConnectionSettings = {
  apiUrl: string;
  model: string;
  seed: number;
  steps: number;
  width: number;
  height: number;
};

export type GenericSettings = {
  theme: 'light' | 'dark';
};

export type PersistedGenerationSettings = {
  connection: ConnectionSettings;
  generic: GenericSettings;
};

export type SaveStatusHandlers = {
  setSaveResult: (message: string | null) => void;
  setSaveError: (isError: boolean) => void;
};
