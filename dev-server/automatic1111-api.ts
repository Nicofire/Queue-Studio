import type { IncomingMessage, ServerResponse } from 'node:http';

import { sendJson } from './http-utils';

export const AUTOMATIC1111_MODELS_PATH = '/api/automatic1111/models';

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

  const normalizedBaseUrl = rawBaseUrl.replace(/\/$/, '');
  const targetUrl = `${normalizedBaseUrl}/sdapi/v1/sd-models`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(targetUrl, { signal: controller.signal });
    const bodyText = await response.text();

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
