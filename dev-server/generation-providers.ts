import type { ProviderId } from '../src/features/settings/generationSettings.ts';
import { automatic1111Provider } from './automatic1111-api.ts';
import { comfyuiProvider } from './comfyui-api.ts';

export function getGenerationProvider(provider: ProviderId) {
  return provider === 'comfyui' ? comfyuiProvider : automatic1111Provider;
}
