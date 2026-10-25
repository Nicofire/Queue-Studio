import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

import { pathExists, readRequestBody, sendJson } from './http-utils';

const CONFIG_FILE_MAP = {
  'positive-presets': 'positive-presets.json',
  'negative-presets': 'negative-presets.json',
  settings: 'settings.json',
} as const;

type ConfigKey = keyof typeof CONFIG_FILE_MAP;

export async function handleConfigFilesRequest(
  req: IncomingMessage,
  res: ServerResponse,
  requestUrl: string,
  projectRoot: string
) {
  const configMatch = requestUrl.match(
    /^\/api\/config\/(positive-presets|negative-presets|settings)$/
  );

  if (!configMatch) {
    return false;
  }

  const configKey = configMatch[1] as ConfigKey;
  const fileName = CONFIG_FILE_MAP[configKey];
  const dataDir = path.resolve(projectRoot, 'data');
  const publicPath = path.resolve(projectRoot, 'public', fileName);
  const dataPath = path.resolve(dataDir, fileName);

  await mkdir(dataDir, { recursive: true });

  if (!(await pathExists(dataPath))) {
    if (await pathExists(publicPath)) {
      const initialContent = await readFile(publicPath, 'utf8');
      await writeFile(dataPath, `${initialContent.trim()}\n`, 'utf8');
    } else {
      await writeFile(dataPath, '{}\n', 'utf8');
    }
  }

  if (req.method === 'GET') {
    try {
      const content = await readFile(dataPath, 'utf8');
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(content);
    } catch {
      sendJson(res, 500, { message: 'Could not read config file.' });
    }
    return true;
  }

  if (req.method === 'POST') {
    try {
      const payload = await readRequestBody(req);
      await writeFile(dataPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      sendJson(res, 200, { ok: true });
    } catch {
      sendJson(res, 400, { message: 'Could not parse or write config payload.' });
    }
    return true;
  }

  res.statusCode = 405;
  res.setHeader('Allow', 'GET, POST');
  res.end();
  return true;
}
