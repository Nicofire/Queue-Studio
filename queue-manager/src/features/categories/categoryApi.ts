const CATEGORY_CREATE_PATH = '/api/categorys';
const CATEGORY_RENAME_PATH = '/api/categorys/rename';

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
