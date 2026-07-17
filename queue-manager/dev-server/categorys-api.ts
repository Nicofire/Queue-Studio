import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

import {
  readPlaceIdFromJsonContent,
  slugifyCategoryName,
  toCategoryTitleFromSlug,
} from './categorys-utils';
import { pathExists, readRequestBody, sendJson } from './http-utils';

export const CATEGORY_CREATE_PATH = '/api/categorys';
export const CATEGORY_RENAME_PATH = '/api/categorys/rename';
export const CATEGORY_REORDER_PATH = '/api/categorys/reorder';
export const CATEGORY_ENTRY_CREATE_PATH = '/api/categorys/entries/create';
export const CATEGORY_ENTRY_FAVORITE_PATH = '/api/categorys/entries/favorite';

async function getCategoryDir(projectRoot: string) {
  const categoryDir = path.resolve(projectRoot, 'data', 'categorys');
  await mkdir(categoryDir, { recursive: true });
  return categoryDir;
}

export async function handleCategorysRequest(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  projectRoot: string
) {
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
    const payload = (await readRequestBody(req)) as { name?: unknown };
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

    const targetPath = path.resolve(categoryDir, `${categoryId}.json`);
    if (await pathExists(targetPath)) {
      sendJson(res, 409, { message: 'A category with this name already exists.' });
      return true;
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
    await writeFile(targetPath, `${JSON.stringify({ placeId, templates: {} }, null, 2)}\n`, 'utf8');

    sendJson(res, 200, {
      id: categoryId,
      title: toCategoryTitleFromSlug(categoryId),
      placeId,
    });
  } catch {
    sendJson(res, 400, { message: 'Could not create category file.' });
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
    const payload = (await readRequestBody(req)) as { oldId?: unknown; newName?: unknown };
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

    const sourcePath = path.resolve(categoryDir, `${oldId}.json`);
    if (!(await pathExists(sourcePath))) {
      sendJson(res, 404, { message: 'Source category file was not found.' });
      return true;
    }

    const targetPath = path.resolve(categoryDir, `${newId}.json`);
    if (newId !== oldId && (await pathExists(targetPath))) {
      sendJson(res, 409, { message: 'A category with this name already exists.' });
      return true;
    }

    const rawContent = await readFile(sourcePath, 'utf8');
    const placeId = readPlaceIdFromJsonContent(rawContent) ?? 0;

    if (newId !== oldId) {
      await rename(sourcePath, targetPath);
    }

    sendJson(res, 200, {
      oldId,
      id: newId,
      title: toCategoryTitleFromSlug(newId),
      placeId,
    });
  } catch {
    sendJson(res, 400, { message: 'Could not rename category file.' });
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
    const payload = (await readRequestBody(req)) as { orderedIds?: unknown };
    const orderedIds = Array.isArray(payload?.orderedIds)
      ? payload.orderedIds.filter((item): item is string => typeof item === 'string')
      : [];

    if (orderedIds.length === 0) {
      sendJson(res, 400, { message: 'orderedIds must be a non-empty string array.' });
      return true;
    }

    const existingFiles = (await readdir(categoryDir)).filter((name) => name.endsWith('.json'));
    const existingIds = existingFiles.map((file) => file.replace(/\.json$/, ''));
    const existingSet = new Set(existingIds);
    const orderedSet = new Set(orderedIds);

    if (orderedSet.size !== orderedIds.length) {
      sendJson(res, 400, { message: 'orderedIds must not contain duplicates.' });
      return true;
    }

    if (orderedIds.length !== existingIds.length) {
      sendJson(res, 400, {
        message: 'orderedIds length must match current category file count.',
      });
      return true;
    }

    for (const id of orderedIds) {
      if (!existingSet.has(id)) {
        sendJson(res, 400, { message: `Unknown category id: ${id}` });
        return true;
      }
    }

    for (const id of existingIds) {
      if (!orderedSet.has(id)) {
        sendJson(res, 400, { message: `Missing category id: ${id}` });
        return true;
      }
    }

    for (let placeId = 0; placeId < orderedIds.length; placeId += 1) {
      const id = orderedIds[placeId];
      const filePath = path.resolve(categoryDir, `${id}.json`);
      const rawContent = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(rawContent.replace(/^\uFEFF/, '')) as Record<string, unknown>;
      parsed.placeId = placeId;
      await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    }

    sendJson(res, 200, { ok: true });
  } catch {
    sendJson(res, 400, { message: 'Could not reorder category files.' });
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

    const categoryId = typeof payload?.categoryId === 'string' ? payload.categoryId.trim() : '';
    const entryName = typeof payload?.entryName === 'string' ? payload.entryName.trim() : '';

    if (!categoryId || !entryName) {
      sendJson(res, 400, { message: 'categoryId and entryName are required.' });
      return true;
    }

    const categoryPath = path.resolve(categoryDir, `${categoryId}.json`);
    if (!(await pathExists(categoryPath))) {
      sendJson(res, 404, { message: 'Category file was not found.' });
      return true;
    }

    const rawContent = await readFile(categoryPath, 'utf8');
    const parsed = JSON.parse(rawContent.replace(/^\uFEFF/, '')) as {
      templates?: Record<string, unknown>;
      [key: string]: unknown;
    };

    const templates =
      parsed.templates && typeof parsed.templates === 'object' ? parsed.templates : {};
    const duplicateEntry = Object.keys(templates).some(
      (templateKey) => templateKey.toLowerCase() === entryName.toLowerCase()
    );
    if (duplicateEntry) {
      sendJson(res, 409, { message: 'An entry with this name already exists.' });
      return true;
    }

    let imagePath = '';
    const imageDataBase64 =
      typeof payload.imageDataBase64 === 'string' ? payload.imageDataBase64 : '';
    if (imageDataBase64.length > 0) {
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
      await writeFile(targetImagePath, Buffer.from(imageDataBase64, 'base64'));
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

    await writeFile(categoryPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    sendJson(res, 200, {
      templateId: entryName,
      title: entryName,
      data: nextEntry,
    });
  } catch {
    sendJson(res, 400, { message: 'Could not create category entry.' });
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
    const payload = (await readRequestBody(req)) as {
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

    const categoryPath = path.resolve(categoryDir, `${categoryId}.json`);
    if (!(await pathExists(categoryPath))) {
      sendJson(res, 404, { message: 'Category file was not found.' });
      return true;
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
      sendJson(res, 404, { message: 'Entry was not found in the category.' });
      return true;
    }

    const currentEntry = templates[matchedKey];
    parsed.templates = {
      ...templates,
      [matchedKey]:
        currentEntry && typeof currentEntry === 'object'
          ? { ...currentEntry, favorite }
          : { favorite },
    };

    await writeFile(categoryPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    sendJson(res, 200, { categoryId, entryName: matchedKey, favorite });
  } catch {
    sendJson(res, 400, { message: 'Could not update favorite state.' });
  }

  return true;
}
