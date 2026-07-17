import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import {
  readPlaceIdFromJsonContent,
  slugifyCategoryName,
  toCategoryTitleFromSlug,
} from './dev-server/categorys-utils';

const CONFIG_FILE_MAP = {
  'positive-presets': 'positive-presets.json',
  'negative-presets': 'negative-presets.json',
  settings: 'settings.json',
} as const;

const AUTOMATIC1111_MODELS_PATH = '/api/automatic1111/models';
const CATEGORY_CREATE_PATH = '/api/categorys';
const CATEGORY_RENAME_PATH = '/api/categorys/rename';
const CATEGORY_REORDER_PATH = '/api/categorys/reorder';
const CATEGORY_ENTRY_CREATE_PATH = '/api/categorys/entries/create';
const CATEGORY_ENTRY_FAVORITE_PATH = '/api/categorys/entries/favorite';
const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));

type ConfigKey = keyof typeof CONFIG_FILE_MAP;

async function pathExists(targetPath: string) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readRequestBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    let rawBody = '';

    req.on('data', (chunk) => {
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

// https://vite.dev/config/
export default defineConfig({
  root: PROJECT_ROOT,
  plugins: [
    react(),
    {
      name: 'config-json-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const requestUrl = req.url ?? '';
          const parsedUrl = new URL(requestUrl, 'http://localhost');

          if (parsedUrl.pathname === AUTOMATIC1111_MODELS_PATH) {
            if (req.method !== 'GET') {
              res.statusCode = 405;
              res.setHeader('Allow', 'GET');
              res.end();
              return;
            }

            const rawBaseUrl = parsedUrl.searchParams.get('baseUrl')?.trim() ?? '';
            if (!rawBaseUrl) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ message: 'Missing baseUrl query parameter.' }));
              return;
            }

            const normalizedBaseUrl = rawBaseUrl.replace(/\/$/, '');
            const targetUrl = `${normalizedBaseUrl}/sdapi/v1/sd-models`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            try {
              const response = await fetch(targetUrl, { signal: controller.signal });
              const bodyText = await response.text();

              if (!response.ok) {
                res.statusCode = response.status;
                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({
                    message: `Automatic1111 request failed with status ${response.status}.`,
                  })
                );
                return;
              }

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(bodyText);
            } catch (error) {
              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  message:
                    error instanceof Error ? error.message : 'Could not reach Automatic1111.',
                })
              );
            } finally {
              clearTimeout(timeoutId);
            }
            return;
          }

          if (parsedUrl.pathname === CATEGORY_CREATE_PATH) {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.setHeader('Allow', 'POST');
              res.end();
              return;
            }

            const rootDir = PROJECT_ROOT;
            const categoryDir = path.resolve(rootDir, 'data', 'categorys');

            await mkdir(categoryDir, { recursive: true });

            try {
              const payload = (await readRequestBody(req)) as { name?: unknown };
              const rawName = typeof payload?.name === 'string' ? payload.name.trim() : '';

              if (!rawName) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ message: 'Category name is required.' }));
                return;
              }

              const categoryId = slugifyCategoryName(rawName);
              if (!categoryId) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({
                    message: 'Category name must include at least one letter or number.',
                  })
                );
                return;
              }

              const targetPath = path.resolve(categoryDir, `${categoryId}.json`);
              if (await pathExists(targetPath)) {
                res.statusCode = 409;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ message: 'A category with this name already exists.' }));
                return;
              }

              const entries = await readdir(categoryDir);
              let maxPlaceId = -1;

              for (const fileName of entries) {
                if (!fileName.endsWith('.json')) {
                  continue;
                }

                try {
                  const filePath = path.resolve(categoryDir, fileName);
                  const rawContent = await readFile(filePath, 'utf8');
                  const placeId = readPlaceIdFromJsonContent(rawContent);
                  if (placeId !== null) {
                    maxPlaceId = Math.max(maxPlaceId, placeId);
                  }
                } catch {
                  // Ignore invalid category files when computing next placeId.
                }
              }

              const placeId = maxPlaceId + 1;
              const nextPayload = {
                placeId,
                templates: {},
              };

              await writeFile(targetPath, `${JSON.stringify(nextPayload, null, 2)}\n`, 'utf8');

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  id: categoryId,
                  title: toCategoryTitleFromSlug(categoryId),
                  placeId,
                })
              );
            } catch {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ message: 'Could not create category file.' }));
            }
            return;
          }

          if (parsedUrl.pathname === CATEGORY_RENAME_PATH) {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.setHeader('Allow', 'POST');
              res.end();
              return;
            }

            const rootDir = PROJECT_ROOT;
            const categoryDir = path.resolve(rootDir, 'data', 'categorys');

            await mkdir(categoryDir, { recursive: true });

            try {
              const payload = (await readRequestBody(req)) as {
                oldId?: unknown;
                newName?: unknown;
              };

              const oldId = typeof payload?.oldId === 'string' ? payload.oldId.trim() : '';
              const newName = typeof payload?.newName === 'string' ? payload.newName.trim() : '';

              if (!oldId || !newName) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ message: 'oldId and newName are required.' }));
                return;
              }

              const newId = slugifyCategoryName(newName);
              if (!newId) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({
                    message: 'Category name must include at least one letter or number.',
                  })
                );
                return;
              }

              const sourcePath = path.resolve(categoryDir, `${oldId}.json`);
              if (!(await pathExists(sourcePath))) {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ message: 'Source category file was not found.' }));
                return;
              }

              const targetPath = path.resolve(categoryDir, `${newId}.json`);
              if (newId !== oldId && (await pathExists(targetPath))) {
                res.statusCode = 409;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ message: 'A category with this name already exists.' }));
                return;
              }

              const rawContent = await readFile(sourcePath, 'utf8');
              const placeId = readPlaceIdFromJsonContent(rawContent) ?? 0;

              if (newId !== oldId) {
                await rename(sourcePath, targetPath);
              }

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  oldId,
                  id: newId,
                  title: toCategoryTitleFromSlug(newId),
                  placeId,
                })
              );
            } catch {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ message: 'Could not rename category file.' }));
            }
            return;
          }

          if (parsedUrl.pathname === CATEGORY_REORDER_PATH) {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.setHeader('Allow', 'POST');
              res.end();
              return;
            }

            const rootDir = PROJECT_ROOT;
            const categoryDir = path.resolve(rootDir, 'data', 'categorys');

            await mkdir(categoryDir, { recursive: true });

            try {
              const payload = (await readRequestBody(req)) as { orderedIds?: unknown };
              const orderedIds = Array.isArray(payload?.orderedIds)
                ? payload.orderedIds.filter((item): item is string => typeof item === 'string')
                : [];

              if (orderedIds.length === 0) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({ message: 'orderedIds must be a non-empty string array.' })
                );
                return;
              }

              const existingFiles = (await readdir(categoryDir)).filter((name) =>
                name.endsWith('.json')
              );
              const existingIds = existingFiles.map((file) => file.replace(/\.json$/, ''));

              const existingSet = new Set(existingIds);
              const orderedSet = new Set(orderedIds);

              if (orderedSet.size !== orderedIds.length) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ message: 'orderedIds must not contain duplicates.' }));
                return;
              }

              if (orderedIds.length !== existingIds.length) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({
                    message: 'orderedIds length must match current category file count.',
                  })
                );
                return;
              }

              for (const id of orderedIds) {
                if (!existingSet.has(id)) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ message: `Unknown category id: ${id}` }));
                  return;
                }
              }

              for (const id of existingIds) {
                if (!orderedSet.has(id)) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ message: `Missing category id: ${id}` }));
                  return;
                }
              }

              for (let placeId = 0; placeId < orderedIds.length; placeId += 1) {
                const id = orderedIds[placeId];
                const filePath = path.resolve(categoryDir, `${id}.json`);
                const rawContent = await readFile(filePath, 'utf8');
                const withoutBom = rawContent.replace(/^\uFEFF/, '');
                const parsed = JSON.parse(withoutBom) as {
                  placeId?: unknown;
                  templates?: unknown;
                  [key: string]: unknown;
                };

                parsed.placeId = placeId;

                await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
              }

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
            } catch {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ message: 'Could not reorder category files.' }));
            }
            return;
          }

          if (parsedUrl.pathname === CATEGORY_ENTRY_CREATE_PATH) {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.setHeader('Allow', 'POST');
              res.end();
              return;
            }

            const rootDir = PROJECT_ROOT;
            const categoryDir = path.resolve(rootDir, 'data', 'categorys');
            const imageDir = path.resolve(rootDir, 'public', 'static', 'images');

            await mkdir(categoryDir, { recursive: true });
            await mkdir(imageDir, { recursive: true });

            try {
              const payload = (await readRequestBody(req)) as {
                categoryId?: unknown;
                entryName?: unknown;
                positive_prompt?: unknown;
                negative_prompt?: unknown;
                loras?: unknown;
                model?: unknown;
                imageDataBase64?: unknown;
                imageOriginalName?: unknown;
              };

              const categoryId =
                typeof payload?.categoryId === 'string' ? payload.categoryId.trim() : '';
              const entryName =
                typeof payload?.entryName === 'string' ? payload.entryName.trim() : '';

              if (!categoryId || !entryName) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ message: 'categoryId and entryName are required.' }));
                return;
              }

              const categoryPath = path.resolve(categoryDir, `${categoryId}.json`);
              if (!(await pathExists(categoryPath))) {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ message: 'Category file was not found.' }));
                return;
              }

              const rawContent = await readFile(categoryPath, 'utf8');
              const parsed = JSON.parse(rawContent.replace(/^\uFEFF/, '')) as {
                placeId?: unknown;
                templates?: Record<string, unknown>;
                [key: string]: unknown;
              };

              const templates =
                parsed.templates && typeof parsed.templates === 'object' ? parsed.templates : {};

              const duplicateEntry = Object.keys(templates).some(
                (templateKey) => templateKey.toLowerCase() === entryName.toLowerCase()
              );
              if (duplicateEntry) {
                res.statusCode = 409;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ message: 'An entry with this name already exists.' }));
                return;
              }

              let imagePath = '';
              const imageDataBase64 =
                typeof payload.imageDataBase64 === 'string' ? payload.imageDataBase64 : '';
              const hasImageData = imageDataBase64.length > 0;
              if (hasImageData) {
                const originalName =
                  typeof payload.imageOriginalName === 'string'
                    ? payload.imageOriginalName
                    : 'entry-image.png';
                const rawExtension = path.extname(originalName).toLowerCase();
                const allowedExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp']);
                const extension = allowedExtensions.has(rawExtension) ? rawExtension : '.png';

                const imageBaseName = slugifyCategoryName(entryName) || 'entry';
                const fileName = `${imageBaseName}_${Date.now()}${extension}`;
                const targetImagePath = path.resolve(imageDir, fileName);

                const binary = Buffer.from(imageDataBase64, 'base64');
                await writeFile(targetImagePath, binary);
                imagePath = `static/images/${fileName}`;
              }

              const nextEntry = {
                positive_prompt:
                  typeof payload.positive_prompt === 'string' ? payload.positive_prompt : '',
                negative_prompt:
                  typeof payload.negative_prompt === 'string' ? payload.negative_prompt : '',
                loras: typeof payload.loras === 'string' ? payload.loras : '',
                image_path: imagePath,
                favorite: false,
                ...(typeof payload.model === 'string' && payload.model.trim()
                  ? { model: payload.model.trim() }
                  : {}),
              };

              const nextTemplates = {
                ...templates,
                [entryName]: nextEntry,
              };

              parsed.templates = nextTemplates;

              await writeFile(categoryPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  templateId: entryName,
                  title: entryName,
                  data: nextEntry,
                })
              );
            } catch {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ message: 'Could not create category entry.' }));
            }
            return;
          }

          if (parsedUrl.pathname === CATEGORY_ENTRY_FAVORITE_PATH) {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.setHeader('Allow', 'POST');
              res.end();
              return;
            }

            const rootDir = PROJECT_ROOT;
            const categoryDir = path.resolve(rootDir, 'data', 'categorys');

            await mkdir(categoryDir, { recursive: true });

            try {
              const payload = (await readRequestBody(req)) as {
                categoryId?: unknown;
                entryName?: unknown;
                favorite?: unknown;
              };

              const categoryId =
                typeof payload.categoryId === 'string' ? payload.categoryId.trim() : '';
              const entryName =
                typeof payload.entryName === 'string' ? payload.entryName.trim() : '';
              const favorite = payload.favorite === true;

              if (!categoryId || !entryName) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ message: 'categoryId and entryName are required.' }));
                return;
              }

              const categoryPath = path.resolve(categoryDir, `${categoryId}.json`);
              if (!(await pathExists(categoryPath))) {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ message: 'Category file was not found.' }));
                return;
              }

              const rawContent = await readFile(categoryPath, 'utf8');
              const parsed = JSON.parse(rawContent.replace(/^\uFEFF/, '')) as {
                templates?: Record<string, unknown>;
                [key: string]: unknown;
              };

              const templates =
                parsed.templates && typeof parsed.templates === 'object' ? parsed.templates : {};

              const matchedKey = Object.keys(templates).find(
                (templateKey) => templateKey.toLowerCase() === entryName.toLowerCase()
              );

              if (!matchedKey) {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ message: 'Entry was not found in the category.' }));
                return;
              }

              const currentEntry = templates[matchedKey];
              const nextEntry =
                currentEntry && typeof currentEntry === 'object'
                  ? { ...currentEntry, favorite }
                  : { favorite };

              parsed.templates = {
                ...templates,
                [matchedKey]: nextEntry,
              };

              await writeFile(categoryPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ categoryId, entryName: matchedKey, favorite }));
            } catch {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ message: 'Could not update favorite state.' }));
            }
            return;
          }

          const configMatch = requestUrl.match(
            /^\/api\/config\/(positive-presets|negative-presets|settings)$/
          );

          if (!configMatch) {
            next();
            return;
          }

          const configKey = configMatch[1] as ConfigKey;
          const fileName = CONFIG_FILE_MAP[configKey];
          const rootDir = PROJECT_ROOT;
          const dataDir = path.resolve(rootDir, 'data');
          const publicPath = path.resolve(rootDir, 'public', fileName);
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
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ message: 'Could not read config file.' }));
            }
            return;
          }

          if (req.method === 'POST') {
            try {
              const payload = await readRequestBody(req);
              await writeFile(dataPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
            } catch {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ message: 'Could not parse or write config payload.' }));
            }
            return;
          }

          res.statusCode = 405;
          res.setHeader('Allow', 'GET, POST');
          res.end();
        });
      },
    },
  ],
});
