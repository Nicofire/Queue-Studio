import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';

export class RequestBodyTooLargeError extends Error {
  readonly limitBytes: number;

  constructor(limitBytes: number) {
    super(`Request body exceeds ${limitBytes} bytes.`);
    this.name = 'RequestBodyTooLargeError';
    this.limitBytes = limitBytes;
  }
}

export async function pathExists(targetPath: string) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function readRequestBody(
  req: IncomingMessage,
  options?: { maxBytes?: number }
): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    const maxBytes = options?.maxBytes ?? 1_000_000;
    let rawBody = '';
    let receivedBytes = 0;

    req.on('data', (chunk) => {
      receivedBytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
      if (receivedBytes > maxBytes) {
        req.destroy(new RequestBodyTooLargeError(maxBytes));
        return;
      }

      rawBody += chunk;
    });

    req.on('end', () => {
      try {
        resolve(rawBody ? JSON.parse(rawBody) : {});
      } catch (error) {
        reject(error);
      }
    });

    req.on('error', reject);
  });
}

export function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}
