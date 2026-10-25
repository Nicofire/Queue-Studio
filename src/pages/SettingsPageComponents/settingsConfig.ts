import type { PromptPresetGroup } from './settingsTypes';
export { DEFAULT_GENERATION_SETTINGS } from '../../features/settings/generationSettings';

export const STORAGE_KEYS = {
  positivePresets: 'queue-manager.positive-presets',
  negativePresets: 'queue-manager.negative-presets',
  generationSettings: 'queue-manager.generation-settings',
} as const;

export const REMOTE_JSON_PATHS = {
  positivePresets: '/api/config/positive-presets',
  negativePresets: '/api/config/negative-presets',
  generationSettings: '/api/config/settings',
} as const;

export const MODEL_PROXY_PATH = '/api/automatic1111/models';

export const DEFAULT_POSITIVE_PRESETS: PromptPresetGroup = {
  selectedPreset: 'Default Positive',
  presets: {
    'Default Positive': 'high quality, detailed, sharp focus, best composition',
    Cinematic: 'cinematic lighting, dramatic scene, film still, rich contrast',
    Portrait: 'portrait, soft lighting, natural skin tones, clear facial details',
  },
};

export const DEFAULT_NEGATIVE_PRESETS: PromptPresetGroup = {
  selectedPreset: 'Default Negative',
  presets: {
    'Default Negative': 'low quality, blurry, noisy, watermark, text, cropped',
    Anime: 'bad anatomy, extra fingers, deformed hands, low detail',
    Photo: 'motion blur, overexposed, underexposed, bad framing',
  },
};
