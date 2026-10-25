import type { IncomingMessage, ServerResponse } from 'node:http';

import { validateApiUrl } from '../src/features/settings/generationSettings.ts';
import type { GenerationProvider } from './generation-provider.ts';
import { readResponseBytes, sendJson } from './http-utils.ts';

export const AUTOMATIC1111_MODELS_PATH = '/api/automatic1111/models';

export const automatic1111Provider: GenerationProvider = {
  id: 'automatic1111',
  async listModels(apiUrl, signal) {
    const response = await fetch(`${validateApiUrl(apiUrl)}/sdapi/v1/sd-models`, {
      signal,
      redirect: 'error',
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Automatic1111 model discovery failed (${response.status}).`);
    }
    const models = JSON.parse(
      (await readResponseBytes(response, 16 * 1024 * 1024)).toString('utf8')
    ) as Array<{ title?: string; model_name?: string }>;
    if (!Array.isArray(models)) throw new Error('Invalid Automatic1111 model response.');
    return models.flatMap((model) => {
      const id = model.title || model.model_name;
      return typeof id === 'string' && id ? [{ id, label: id }] : [];
    });
  },
  async generate(settings, input, batchSize, signal) {
    const model = input.model?.trim() || settings.model;
    const payload = {
      prompt: input.prompt,
      negative_prompt: input.negativePrompt,
      seed: Number.isFinite(input.seed) ? input.seed : settings.seed,
      steps: settings.steps,
      width: settings.width,
      height: settings.height,
      batch_size: batchSize,
      ...(model ? { override_settings: { sd_model_checkpoint: model } } : {}),
    };
    const response = await fetch(`${validateApiUrl(settings.apiUrl)}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
      redirect: 'error',
    });
    if (!response.ok) {
      let message = `Automatic1111 txt2img failed with status ${response.status}.`;
      try {
        const body = JSON.parse(
          (await readResponseBytes(response, 64 * 1024)).toString('utf8')
        ) as { message?: string; detail?: string };
        if (typeof body.message === 'string' && body.message) message = body.message;
        else if (typeof body.detail === 'string' && body.detail) message = body.detail;
      } catch {
        message = `Automatic1111 txt2img failed with status ${response.status}.`;
      }
      throw new Error(message);
    }
    const body = JSON.parse(
      (await readResponseBytes(response, 192 * 1024 * 1024)).toString('utf8')
    ) as { images?: unknown };
    const images = Array.isArray(body.images)
      ? body.images.filter(
          (image): image is string => typeof image === 'string' && image.trim().length > 0
        )
      : [];
    if (images.length === 0) {
      throw new Error('Automatic1111 response did not contain generated images.');
    }
    if (
      images.length > 16 ||
      images.some((image) => image.length > (32 * 1024 * 1024 * 4) / 3 + 4)
    ) {
      throw new Error('Automatic1111 image response exceeds the supported size or image count.');
    }
    return images;
  },
};

export async function handleAutomatic1111Request(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
) {
  if (parsedUrl.pathname !== AUTOMATIC1111_MODELS_PATH) {
    return false;
  }

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    res.end();
    return true;
  }

  const rawBaseUrl = parsedUrl.searchParams.get('baseUrl')?.trim() ?? '';
  if (!rawBaseUrl) {
    sendJson(res, 400, { message: 'Missing baseUrl query parameter.' });
    return true;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const targetUrl = `${validateApiUrl(rawBaseUrl)}/sdapi/v1/sd-models`;
    const response = await fetch(targetUrl, { signal: controller.signal, redirect: 'error' });
    const bodyText = (await readResponseBytes(response, 16 * 1024 * 1024)).toString('utf8');

    if (!response.ok) {
      sendJson(res, response.status, {
        message: `Automatic1111 request failed with status ${response.status}.`,
      });
      return true;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(bodyText);
  } catch (error) {
    sendJson(res, 502, {
      message: error instanceof Error ? error.message : 'Could not reach Automatic1111.',
    });
  } finally {
    clearTimeout(timeoutId);
  }

  return true;
}
