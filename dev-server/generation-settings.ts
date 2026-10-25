import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  normalizeGenerationSettings,
  toPersistedGenerationSettings,
  asRecord,
} from '../src/features/settings/generationSettings.ts';
import { pathExists } from './http-utils.ts';

export async function readGenerationSettings(projectRoot: string) {
  const dataPath = path.resolve(projectRoot, 'data', 'settings.json');
  const filename = (await pathExists(dataPath))
    ? dataPath
    : path.resolve(projectRoot, 'public', 'settings.json');
  return normalizeGenerationSettings(
    JSON.parse((await readFile(filename, 'utf8')).replace(/^\uFEFF/, ''))
  );
}

export class SavedConnectionMismatchError extends Error {
  constructor() {
    super(
      'Connection settings have unsaved changes. Save connection settings before generating.'
    );
  }
}

export function assertSavedConnection(
  payload: unknown,
  settings: Awaited<ReturnType<typeof readGenerationSettings>>
) {
  const expected = asRecord(payload).expectedConnection;
  if (expected === undefined) return;
  const normalized = normalizeGenerationSettings({ schemaVersion: 2, connection: expected });
  if (
    JSON.stringify(toPersistedGenerationSettings(normalized).connection) !==
    JSON.stringify(toPersistedGenerationSettings(settings).connection)
  ) {
    throw new SavedConnectionMismatchError();
  }
}
