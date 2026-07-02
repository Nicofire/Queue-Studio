export type CategoryTemplate = {
  positive_prompt: string;
  negative_prompt: string;
  loras: string;
  image_path: string;
  model?: string;
};

export type CategoryTemplateEntry = {
  templateId: string;
  title: string;
  data: CategoryTemplate;
};

export type CategoryFile = {
  placeId: number;
  templates: Record<string, CategoryTemplate>;
};

export type CategoryDefinition = {
  id: string;
  title: string;
  placeId: number;
  templates: CategoryTemplateEntry[];
};

export type CategorySelectionMap = Record<string, string[]>;
