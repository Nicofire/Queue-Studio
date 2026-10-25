import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

import {
  normalizeGenerationSettings,
  toPersistedGenerationSettings,
  validateApiUrl,
} from '../src/features/settings/generationSettings.ts';
import { readWorkflow } from './comfyui-workflows.ts';
import {
  beginOperation,
  finishOperation,
  getActiveOperation,
  type GenerationOperation,
} from './generation-operations.ts';
import { readGenerationSettings } from './generation-settings.ts';
import { pathExists, readRequestBody, sendJson } from './http-utils.ts';

const CONFIG_FILE_MAP = {
  'positive-presets': 'positive-presets.json',
  'negative-presets': 'negative-presets.json',
  settings: 'settings.json',
} as const;

type ConfigKey = keyof typeof CONFIG_FILE_MAP;
let settingsWriteInFlight = false;

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
    let operation: GenerationOperation | undefined;
    let ownsSettingsWrite = false;
    let temporary: string | undefined;
    try {
      let payload = await readRequestBody(req);
      if (configKey === 'settings') {
        if (settingsWriteInFlight) {
          sendJson(res, 409, { message: 'Another settings save is already in progress.' });
          return true;
        }
        settingsWriteInFlight = true;
        ownsSettingsWrite = true;
        const next = normalizeGenerationSettings(payload);
        for (const profile of Object.values(next.profiles))
          profile.apiUrl = validateApiUrl(profile.apiUrl);
        const current = await readGenerationSettings(projectRoot);
        const changed =
          JSON.stringify(toPersistedGenerationSettings(next).connection) !==
          JSON.stringify(toPersistedGenerationSettings(current).connection);
        if (getActiveOperation() && changed) {
          sendJson(res, 409, {
            message: 'Connection settings cannot change while generation is active.',
          });
          return true;
        }
        if (!getActiveOperation()) operation = beginOperation('configuration');
        await readWorkflow(projectRoot, next.profiles.comfyui.workflowId);
        payload = toPersistedGenerationSettings(next);
      }
      temporary = `${dataPath}.${randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'wx' });
      await rename(temporary, dataPath);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 400, {
        message:
          error instanceof Error ? error.message : 'Could not parse or write config payload.',
      });
    } finally {
      if (operation) finishOperation(operation);
      if (ownsSettingsWrite) settingsWriteInFlight = false;
      if (temporary) await rm(temporary, { force: true });
    }
    return true;
  }

  res.statusCode = 405;
  res.setHeader('Allow', 'GET, POST');
  res.end();
  return true;
}
