const CATEGORY_CREATE_PATH = '/api/categorys';
const CATEGORY_RENAME_PATH = '/api/categorys/rename';
const CATEGORY_REORDER_PATH = '/api/categorys/reorder';
const CATEGORY_ENTRY_CREATE_PATH = '/api/categorys/entries/create';
const CATEGORY_ENTRY_FAVORITE_PATH = '/api/categorys/entries/favorite';

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

type ToggleFavoriteResponse = {
  categoryId: string;
  entryName: string;
  favorite: boolean;
};

export async function createCategoryInProject(name: string): Promise<CreateCategoryResponse> {
  const response = await fetch(CATEGORY_CREATE_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    let message = `Could not create category (status ${response.status}).`;
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload.message) {
        message = payload.message;
      }
    } catch {
      // Keep fallback message.
    }
    throw new Error(message);
  }

  return (await response.json()) as CreateCategoryResponse;
}

export async function renameCategoryInProject(
  oldId: string,
  newName: string
): Promise<RenameCategoryResponse> {
  const response = await fetch(CATEGORY_RENAME_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ oldId, newName }),
  });

  if (!response.ok) {
    let message = `Could not rename category (status ${response.status}).`;
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload.message) {
        message = payload.message;
      }
    } catch {
      // Keep fallback message.
    }
    throw new Error(message);
  }

  return (await response.json()) as RenameCategoryResponse;
}

export async function reorderCategorysInProject(orderedIds: string[]): Promise<void> {
  const response = await fetch(CATEGORY_REORDER_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ orderedIds }),
  });

  if (!response.ok) {
    let message = `Could not reorder categories (status ${response.status}).`;
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload.message) {
        message = payload.message;
      }
    } catch {
      // Keep fallback message.
    }
    throw new Error(message);
  }
}

export async function createCategoryEntryInProject(
  payload: CreateCategoryEntryRequest
): Promise<CreateCategoryEntryResponse> {
  const response = await fetch(CATEGORY_ENTRY_CREATE_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `Could not create entry (status ${response.status}).`;
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

  return (await response.json()) as CreateCategoryEntryResponse;
}

export async function toggleCategoryEntryFavoriteInProject(
  categoryId: string,
  entryName: string,
  favorite: boolean
): Promise<ToggleFavoriteResponse> {
  const response = await fetch(CATEGORY_ENTRY_FAVORITE_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ categoryId, entryName, favorite }),
  });

  if (!response.ok) {
    let message = `Could not update favorite (status ${response.status}).`;
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

  return (await response.json()) as ToggleFavoriteResponse;
}
