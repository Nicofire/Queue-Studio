export type PromptPresetGroup = {
  selectedPreset: string;
  presets: Record<string, string>;
};

export type {
  GenerationSettings,
  PersistedGenerationSettings,
} from '../../features/settings/generationSettings';

export type GenericSettings = {
  theme: 'light' | 'dark';
};

export type SaveStatusHandlers = {
  setSaveResult: (message: string | null) => void;
  setSaveError: (isError: boolean) => void;
};
