const CATEGORY_CREATE_PATH = '/api/categorys';

type CreateCategoryResponse = {
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
