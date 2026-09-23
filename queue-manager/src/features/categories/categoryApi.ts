import type { CategoryDefinition } from './categoryTypes';

const CATEGORY_CREATE_PATH = '/api/categorys';
const CATEGORY_RENAME_PATH = '/api/categorys/rename';
const CATEGORY_REORDER_PATH = '/api/categorys/reorder';
const CATEGORY_ENTRY_CREATE_PATH = '/api/categorys/entries/create';
const CATEGORY_ENTRY_UPDATE_PATH = '/api/categorys/entries/update';
const CATEGORY_ENTRY_FAVORITE_PATH = '/api/categorys/entries/favorite';
const CATEGORIES_LIST_PATH = '/api/categories';

async function postJson(path: string, payload: unknown, errorPrefix: string) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `${errorPrefix} (status ${response.status}).`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) {
        message = body.message;
      }
    } catch {
      // Keep fallback message.
    }
    throw new Error(message);
  }

  return response;
}

async function getJson(path: string, errorPrefix: string) {
  const response = await fetch(path);

  if (!response.ok) {
    let message = `${errorPrefix} (status ${response.status}).`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) {
        message = body.message;
      }
    } catch {
      // Keep fallback message.
    }
    throw new Error(message);
  }

  return response;
}

type CreateCategoryResponse = {
  id: string;
  title: string;
  placeId: number;
};

type RenameCategoryResponse = {
  oldId: string;
  id: string;
  title: string;
  placeId: number;
};

type CreateCategoryEntryRequest = {
  categoryId: string;
  entryName: string;
  positive_prompt: string;
  negative_prompt: string;
  loras: string;
  model?: string;
  imageDataBase64?: string;
  imageOriginalName?: string;
};

type CreateCategoryEntryResponse = {
  templateId: string;
  title: string;
  data: {
    positive_prompt: string;
    negative_prompt: string;
    loras: string;
    image_path: string;
    favorite: boolean;
    model?: string;
  };
};

type UpdateCategoryEntryRequest = {
  categoryId: string;
  entryName: string;
  newEntryName?: string;
  positive_prompt: string;
  negative_prompt: string;
  loras: string;
  model?: string;
  imageDataBase64?: string;
  imageOriginalName?: string;
  removeImage?: boolean;
};

type UpdateCategoryEntryResponse = CreateCategoryEntryResponse & {
  previousTemplateId: string;
};

type ToggleFavoriteResponse = {
  categoryId: string;
  entryName: string;
  favorite: boolean;
};

type CategoriesListResponse = {
  categories: CategoryDefinition[];
};

export async function loadCategoriesFromProject(): Promise<CategoryDefinition[]> {
  const response = await getJson(CATEGORIES_LIST_PATH, 'Could not load categories');
  const body = (await response.json()) as CategoriesListResponse;
  return Array.isArray(body.categories) ? body.categories : [];
}

export async function createCategoryInProject(name: string): Promise<CreateCategoryResponse> {
  const response = await postJson(CATEGORY_CREATE_PATH, { name }, 'Could not create category');
  return (await response.json()) as CreateCategoryResponse;
}

export async function renameCategoryInProject(
  oldId: string,
  newName: string
): Promise<RenameCategoryResponse> {
  const response = await postJson(
    CATEGORY_RENAME_PATH,
    { oldId, newName },
    'Could not rename category'
  );
  return (await response.json()) as RenameCategoryResponse;
}

export async function reorderCategorysInProject(orderedIds: string[]): Promise<void> {
  await postJson(CATEGORY_REORDER_PATH, { orderedIds }, 'Could not reorder categories');
}

export async function createCategoryEntryInProject(
  payload: CreateCategoryEntryRequest
): Promise<CreateCategoryEntryResponse> {
  const response = await postJson(CATEGORY_ENTRY_CREATE_PATH, payload, 'Could not create entry');
  return (await response.json()) as CreateCategoryEntryResponse;
}

export async function updateCategoryEntryInProject(
  payload: UpdateCategoryEntryRequest
): Promise<UpdateCategoryEntryResponse> {
  const response = await postJson(CATEGORY_ENTRY_UPDATE_PATH, payload, 'Could not update entry');
  return (await response.json()) as UpdateCategoryEntryResponse;
}

export async function toggleCategoryEntryFavoriteInProject(
  categoryId: string,
  entryName: string,
  favorite: boolean
): Promise<ToggleFavoriteResponse> {
  const response = await postJson(
    CATEGORY_ENTRY_FAVORITE_PATH,
    { categoryId, entryName, favorite },
    'Could not update favorite'
  );
  return (await response.json()) as ToggleFavoriteResponse;
}
