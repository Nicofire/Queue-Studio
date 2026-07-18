import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

import {
  readPlaceIdFromJsonContent,
  slugifyCategoryName,
  toCategoryTitleFromSlug,
} from './categorys-utils';
import { pathExists, readRequestBody, RequestBodyTooLargeError, sendJson } from './http-utils';

export const CATEGORIES_LIST_PATH = '/api/categories';
export const CATEGORY_CREATE_PATH = '/api/categorys';
export const CATEGORY_RENAME_PATH = '/api/categorys/rename';
export const CATEGORY_REORDER_PATH = '/api/categorys/reorder';
export const CATEGORY_ENTRY_CREATE_PATH = '/api/categorys/entries/create';
export const CATEGORY_ENTRY_FAVORITE_PATH = '/api/categorys/entries/favorite';

const CATEGORY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_JSON_BODY_BYTES = 2_000_000;
const MAX_IMAGE_BYTES = 8_000_000;

let mutationQueue: Promise<void> = Promise.resolve();

type CategoryTemplate = {
  positive_prompt: string;
  negative_prompt: string;
  loras: string;
  image_path: string;
  favorite: boolean;
  model?: string;
};

type CategoryDefinition = {
  id: string;
  title: string;
  placeId: number;
  templates: Array<{
    templateId: string;
    title: string;
    data: CategoryTemplate;
  }>;
};

async function getCategoryDir(projectRoot: string) {
  const categoryDir = path.resolve(projectRoot, 'data', 'categorys');
  await mkdir(categoryDir, { recursive: true });
  return categoryDir;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readString = (value: unknown) => (typeof value === 'string' ? value : '');

function isValidCategoryId(categoryId: string) {
  return CATEGORY_ID_PATTERN.test(categoryId);
}

function ensureCategoryPathInsideDir(categoryDir: string, targetPath: string) {
  const relativePath = path.relative(categoryDir, targetPath);
  return Boolean(relativePath) && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function resolveCategoryFilePath(categoryDir: string, categoryId: string) {
  if (!isValidCategoryId(categoryId)) {
    throw new Error('invalid_category_id');
  }

  const categoryPath = path.resolve(categoryDir, `${categoryId}.json`);
  if (!ensureCategoryPathInsideDir(categoryDir, categoryPath)) {
    throw new Error('invalid_category_path');
  }

  return categoryPath;
}

async function atomicWriteFile(filePath: string, content: string) {
  const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tempPath, content, 'utf8');
  await rename(tempPath, filePath);
}

async function runSerializedMutation<T>(operation: () => Promise<T>): Promise<T> {
  const run = mutationQueue.then(operation, operation);
  mutationQueue = run.then(
    () => undefined,
    () => undefined
  );
  return await run;
}

function parseCategoryJson(rawContent: string) {
  return JSON.parse(rawContent.replace(/^\uFEFF/, '')) as {
    placeId?: unknown;
    templates?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

function readCategoryTemplate(value: unknown): CategoryTemplate {
  const data = isRecord(value) ? value : {};
  const model = readString(data.model).trim();

  return {
    positive_prompt: readString(data.positive_prompt),
    negative_prompt: readString(data.negative_prompt),
    loras: readString(data.loras),
    image_path: readString(data.image_path),
    favorite: data.favorite === true,
    ...(model ? { model } : {}),
  };
}

async function loadCategoriesFromDisk(categoryDir: string): Promise<CategoryDefinition[]> {
  const entries = await readdir(categoryDir);
  const categories: CategoryDefinition[] = [];

  for (const fileName of entries) {
    if (!fileName.endsWith('.json')) {
      continue;
    }

    const categoryId = fileName.replace(/\.json$/, '');
    if (!isValidCategoryId(categoryId)) {
      continue;
    }

    const filePath = resolveCategoryFilePath(categoryDir, categoryId);
    const rawContent = await readFile(filePath, 'utf8');
    const parsed = parseCategoryJson(rawContent);

    const templatesRaw = isRecord(parsed.templates) ? parsed.templates : {};
    const templates = Object.entries(templatesRaw)
      .map(([templateId, value]) => ({
        templateId,
        title: templateId,
        data: readCategoryTemplate(value),
      }))
      .sort((a, b) => a.title.localeCompare(b.title));

    const placeId =
      typeof parsed.placeId === 'number' && Number.isFinite(parsed.placeId)
        ? parsed.placeId
        : Number.MAX_SAFE_INTEGER;

    categories.push({
      id: categoryId,
      title: toCategoryTitleFromSlug(categoryId),
      placeId,
      templates,
    });
  }

  return categories.sort((a, b) => a.placeId - b.placeId || a.title.localeCompare(b.title));
}

function estimateBase64DecodedBytes(base64Data: string) {
  const normalized = base64Data.replace(/\s/g, '');
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

function detectImageExtension(buffer: Buffer) {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e) {
    return '.png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return '.jpg';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return '.webp';
  }
  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return '.bmp';
  }
  return null;
}

function sendBodyParsingError(res: ServerResponse, error: unknown, fallbackMessage: string) {
  if (error instanceof RequestBodyTooLargeError) {
    sendJson(res, 413, { message: `Request body exceeds ${error.limitBytes} bytes.` });
    return;
  }

  sendJson(res, 400, { message: fallbackMessage });
}

export async function handleCategorysRequest(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  projectRoot: string
) {
  if (parsedUrl.pathname === CATEGORIES_LIST_PATH) {
    return await handleCategoriesList(req, res, projectRoot);
  }
  if (parsedUrl.pathname === CATEGORY_CREATE_PATH) {
    return await handleCategoryCreate(req, res, projectRoot);
  }
  if (parsedUrl.pathname === CATEGORY_RENAME_PATH) {
    return await handleCategoryRename(req, res, projectRoot);
  }
  if (parsedUrl.pathname === CATEGORY_REORDER_PATH) {
    return await handleCategoryReorder(req, res, projectRoot);
  }
  if (parsedUrl.pathname === CATEGORY_ENTRY_CREATE_PATH) {
    return await handleCategoryEntryCreate(req, res, projectRoot);
  }
  if (parsedUrl.pathname === CATEGORY_ENTRY_FAVORITE_PATH) {
    return await handleCategoryEntryFavorite(req, res, projectRoot);
  }

  return false;
}

async function handleCategoriesList(
  req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string
) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    res.end();
    return true;
  }

  const categoryDir = await getCategoryDir(projectRoot);

  try {
    const categories = await loadCategoriesFromDisk(categoryDir);
    sendJson(res, 200, { categories });
  } catch {
    sendJson(res, 500, { message: 'Could not load categories.' });
  }

  return true;
}

async function handleCategoryCreate(
  req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string
) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end();
    return true;
  }

  const categoryDir = await getCategoryDir(projectRoot);

  try {
    const payload = (await readRequestBody(req, { maxBytes: MAX_JSON_BODY_BYTES })) as {
      name?: unknown;
    };
    const rawName = typeof payload?.name === 'string' ? payload.name.trim() : '';

    if (!rawName) {
      sendJson(res, 400, { message: 'Category name is required.' });
      return true;
    }

    const categoryId = slugifyCategoryName(rawName);
    if (!categoryId) {
      sendJson(res, 400, {
        message: 'Category name must include at least one letter or number.',
      });
      return true;
    }

    const targetPath = resolveCategoryFilePath(categoryDir, categoryId);

    const placeId = await runSerializedMutation(async () => {
      if (await pathExists(targetPath)) {
        throw new Error('category_exists');
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
          const currentPlaceId = readPlaceIdFromJsonContent(rawContent);
          if (currentPlaceId !== null) {
            maxPlaceId = Math.max(maxPlaceId, currentPlaceId);
          }
        } catch {
          // Ignore invalid category files when computing next placeId.
        }
      }

      const nextPlaceId = maxPlaceId + 1;
      await atomicWriteFile(
        targetPath,
        `${JSON.stringify({ placeId: nextPlaceId, templates: {} }, null, 2)}\n`
      );
      return nextPlaceId;
    });

    sendJson(res, 200, {
      id: categoryId,
      title: toCategoryTitleFromSlug(categoryId),
      placeId,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'category_exists') {
      sendJson(res, 409, { message: 'A category with this name already exists.' });
      return true;
    }

    sendBodyParsingError(res, error, 'Could not create category file.');
  }

  return true;
}

async function handleCategoryRename(
  req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string
) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end();
    return true;
  }

  const categoryDir = await getCategoryDir(projectRoot);

  try {
    const payload = (await readRequestBody(req, { maxBytes: MAX_JSON_BODY_BYTES })) as {
      oldId?: unknown;
      newName?: unknown;
    };
    const oldId = typeof payload?.oldId === 'string' ? payload.oldId.trim() : '';
    const newName = typeof payload?.newName === 'string' ? payload.newName.trim() : '';

    if (!oldId || !newName) {
      sendJson(res, 400, { message: 'oldId and newName are required.' });
      return true;
    }

    const newId = slugifyCategoryName(newName);
    if (!newId) {
      sendJson(res, 400, {
        message: 'Category name must include at least one letter or number.',
      });
      return true;
    }

    if (!isValidCategoryId(oldId)) {
      sendJson(res, 400, { message: 'oldId must be a valid category slug.' });
      return true;
    }

    const sourcePath = resolveCategoryFilePath(categoryDir, oldId);
    const targetPath = resolveCategoryFilePath(categoryDir, newId);

    const placeId = await runSerializedMutation(async () => {
      if (!(await pathExists(sourcePath))) {
        throw new Error('source_not_found');
      }

      if (newId !== oldId && (await pathExists(targetPath))) {
        throw new Error('target_exists');
      }

      const rawContent = await readFile(sourcePath, 'utf8');
      const nextPlaceId = readPlaceIdFromJsonContent(rawContent) ?? 0;

      if (newId !== oldId) {
        await rename(sourcePath, targetPath);
      }

      return nextPlaceId;
    });

    sendJson(res, 200, {
      oldId,
      id: newId,
      title: toCategoryTitleFromSlug(newId),
      placeId,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'source_not_found') {
      sendJson(res, 404, { message: 'Source category file was not found.' });
      return true;
    }
    if (error instanceof Error && error.message === 'target_exists') {
      sendJson(res, 409, { message: 'A category with this name already exists.' });
      return true;
    }

    sendBodyParsingError(res, error, 'Could not rename category file.');
  }

  return true;
}

async function handleCategoryReorder(
  req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string
) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end();
    return true;
  }

  const categoryDir = await getCategoryDir(projectRoot);

  try {
    const payload = (await readRequestBody(req, { maxBytes: MAX_JSON_BODY_BYTES })) as {
      orderedIds?: unknown;
    };
    const orderedIds = Array.isArray(payload?.orderedIds)
      ? payload.orderedIds.filter((item): item is string => typeof item === 'string')
      : [];

    if (orderedIds.length === 0) {
      sendJson(res, 400, { message: 'orderedIds must be a non-empty string array.' });
      return true;
    }

    if (orderedIds.some((id) => !isValidCategoryId(id))) {
      sendJson(res, 400, { message: 'orderedIds includes an invalid category slug.' });
      return true;
    }

    await runSerializedMutation(async () => {
      const existingFiles = (await readdir(categoryDir)).filter((name) => name.endsWith('.json'));
      const existingIds = existingFiles.map((file) => file.replace(/\.json$/, ''));
      const existingSet = new Set(existingIds);
      const orderedSet = new Set(orderedIds);

      if (orderedSet.size !== orderedIds.length) {
        throw new Error('duplicate_ids');
      }

      if (orderedIds.length !== existingIds.length) {
        throw new Error('length_mismatch');
      }

      for (const id of orderedIds) {
        if (!existingSet.has(id)) {
          throw new Error(`unknown_id:${id}`);
        }
      }

      for (const id of existingIds) {
        if (!orderedSet.has(id)) {
          throw new Error(`missing_id:${id}`);
        }
      }

      for (let placeId = 0; placeId < orderedIds.length; placeId += 1) {
        const id = orderedIds[placeId];
        const filePath = resolveCategoryFilePath(categoryDir, id);
        const rawContent = await readFile(filePath, 'utf8');
        const parsed = parseCategoryJson(rawContent);
        parsed.placeId = placeId;
        await atomicWriteFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
      }
    });

    sendJson(res, 200, { ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'duplicate_ids') {
      sendJson(res, 400, { message: 'orderedIds must not contain duplicates.' });
      return true;
    }
    if (error instanceof Error && error.message === 'length_mismatch') {
      sendJson(res, 400, { message: 'orderedIds length must match current category file count.' });
      return true;
    }
    if (error instanceof Error && error.message.startsWith('unknown_id:')) {
      sendJson(res, 400, {
        message: `Unknown category id: ${error.message.slice('unknown_id:'.length)}`,
      });
      return true;
    }
    if (error instanceof Error && error.message.startsWith('missing_id:')) {
      sendJson(res, 400, {
        message: `Missing category id: ${error.message.slice('missing_id:'.length)}`,
      });
      return true;
    }

    sendBodyParsingError(res, error, 'Could not reorder category files.');
  }

  return true;
}

async function handleCategoryEntryCreate(
  req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string
) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end();
    return true;
  }

  const categoryDir = await getCategoryDir(projectRoot);
  const imageDir = path.resolve(projectRoot, 'public', 'static', 'images');
  await mkdir(imageDir, { recursive: true });

  try {
    const payload = (await readRequestBody(req, { maxBytes: MAX_JSON_BODY_BYTES })) as {
      categoryId?: unknown;
      entryName?: unknown;
      positive_prompt?: unknown;
      negative_prompt?: unknown;
      loras?: unknown;
      model?: unknown;
      imageDataBase64?: unknown;
      imageOriginalName?: unknown;
    };

    const categoryId = typeof payload?.categoryId === 'string' ? payload.categoryId.trim() : '';
    const entryName = typeof payload?.entryName === 'string' ? payload.entryName.trim() : '';

    if (!categoryId || !entryName) {
      sendJson(res, 400, { message: 'categoryId and entryName are required.' });
      return true;
    }

    if (!isValidCategoryId(categoryId)) {
      sendJson(res, 400, { message: 'categoryId must be a valid category slug.' });
      return true;
    }

    const categoryPath = resolveCategoryFilePath(categoryDir, categoryId);

    const createdEntry = await runSerializedMutation(async () => {
      if (!(await pathExists(categoryPath))) {
        throw new Error('category_not_found');
      }

      const rawContent = await readFile(categoryPath, 'utf8');
      const parsed = parseCategoryJson(rawContent);

      const templates = isRecord(parsed.templates) ? parsed.templates : {};
      const duplicateEntry = Object.keys(templates).some(
        (templateKey) => templateKey.toLowerCase() === entryName.toLowerCase()
      );
      if (duplicateEntry) {
        throw new Error('entry_exists');
      }

      let imagePath = '';
      const imageDataBase64 =
        typeof payload.imageDataBase64 === 'string' ? payload.imageDataBase64.trim() : '';
      if (imageDataBase64.length > 0) {
        if (!/^[A-Za-z0-9+/=\s]+$/.test(imageDataBase64)) {
          throw new Error('invalid_image_data');
        }

        const estimatedImageBytes = estimateBase64DecodedBytes(imageDataBase64);
        if (estimatedImageBytes > MAX_IMAGE_BYTES) {
          throw new Error('image_too_large');
        }

        const imageBuffer = Buffer.from(imageDataBase64.replace(/\s/g, ''), 'base64');
        if (imageBuffer.length === 0 || imageBuffer.length > MAX_IMAGE_BYTES) {
          throw new Error('image_too_large');
        }

        const extension = detectImageExtension(imageBuffer);
        if (!extension) {
          throw new Error('invalid_image_type');
        }

        const imageBaseName = slugifyCategoryName(entryName) || 'entry';
        const fileName = `${imageBaseName}_${Date.now()}${extension}`;
        const targetImagePath = path.resolve(imageDir, fileName);
        await writeFile(targetImagePath, imageBuffer);
        imagePath = `static/images/${fileName}`;
      }

      const nextEntry = {
        positive_prompt: typeof payload.positive_prompt === 'string' ? payload.positive_prompt : '',
        negative_prompt: typeof payload.negative_prompt === 'string' ? payload.negative_prompt : '',
        loras: typeof payload.loras === 'string' ? payload.loras : '',
        image_path: imagePath,
        favorite: false,
        ...(typeof payload.model === 'string' && payload.model.trim()
          ? { model: payload.model.trim() }
          : {}),
      };

      parsed.templates = {
        ...templates,
        [entryName]: nextEntry,
      };

      await atomicWriteFile(categoryPath, `${JSON.stringify(parsed, null, 2)}\n`);

      return {
        templateId: entryName,
        title: entryName,
        data: nextEntry,
      };
    });

    sendJson(res, 200, createdEntry);
  } catch (error) {
    if (error instanceof Error && error.message === 'category_not_found') {
      sendJson(res, 404, { message: 'Category file was not found.' });
      return true;
    }
    if (error instanceof Error && error.message === 'entry_exists') {
      sendJson(res, 409, { message: 'An entry with this name already exists.' });
      return true;
    }
    if (error instanceof Error && error.message === 'invalid_image_data') {
      sendJson(res, 400, { message: 'imageDataBase64 is not valid base64 data.' });
      return true;
    }
    if (error instanceof Error && error.message === 'invalid_image_type') {
      sendJson(res, 400, {
        message: 'Only PNG, JPG, WEBP, and BMP image signatures are supported.',
      });
      return true;
    }
    if (error instanceof Error && error.message === 'image_too_large') {
      sendJson(res, 413, { message: `Image is too large. Max size is ${MAX_IMAGE_BYTES} bytes.` });
      return true;
    }

    sendBodyParsingError(res, error, 'Could not create category entry.');
  }

  return true;
}

async function handleCategoryEntryFavorite(
  req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string
) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end();
    return true;
  }

  const categoryDir = await getCategoryDir(projectRoot);

  try {
    const payload = (await readRequestBody(req, { maxBytes: MAX_JSON_BODY_BYTES })) as {
      categoryId?: unknown;
      entryName?: unknown;
      favorite?: unknown;
    };

    const categoryId = typeof payload.categoryId === 'string' ? payload.categoryId.trim() : '';
    const entryName = typeof payload.entryName === 'string' ? payload.entryName.trim() : '';
    const favorite = payload.favorite === true;

    if (!categoryId || !entryName) {
      sendJson(res, 400, { message: 'categoryId and entryName are required.' });
      return true;
    }

    if (!isValidCategoryId(categoryId)) {
      sendJson(res, 400, { message: 'categoryId must be a valid category slug.' });
      return true;
    }

    const categoryPath = resolveCategoryFilePath(categoryDir, categoryId);

    const updatedEntryName = await runSerializedMutation(async () => {
      if (!(await pathExists(categoryPath))) {
        throw new Error('category_not_found');
      }

      const rawContent = await readFile(categoryPath, 'utf8');
      const parsed = parseCategoryJson(rawContent);

      const templates = isRecord(parsed.templates) ? parsed.templates : {};
      const matchedKey = Object.keys(templates).find(
        (templateKey) => templateKey.toLowerCase() === entryName.toLowerCase()
      );

      if (!matchedKey) {
        throw new Error('entry_not_found');
      }

      const currentEntry = templates[matchedKey];
      parsed.templates = {
        ...templates,
        [matchedKey]:
          currentEntry && typeof currentEntry === 'object'
            ? { ...currentEntry, favorite }
            : { favorite },
      };

      await atomicWriteFile(categoryPath, `${JSON.stringify(parsed, null, 2)}\n`);

      return matchedKey;
    });

    sendJson(res, 200, { categoryId, entryName: updatedEntryName, favorite });
  } catch (error) {
    if (error instanceof Error && error.message === 'category_not_found') {
      sendJson(res, 404, { message: 'Category file was not found.' });
      return true;
    }
    if (error instanceof Error && error.message === 'entry_not_found') {
      sendJson(res, 404, { message: 'Entry was not found in the category.' });
      return true;
    }

    sendBodyParsingError(res, error, 'Could not update favorite state.');
  }

  return true;
}
