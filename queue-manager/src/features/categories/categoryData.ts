import type { CategoryDefinition, CategoryFile, CategoryTemplate } from './categoryTypes';

const categoryModules = import.meta.glob('../../../data/categorys/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

const humanizeCategoryName = (value: string) =>
  value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readString = (value: unknown) => (typeof value === 'string' ? value : '');
const readBoolean = (value: unknown) => value === true;

const readNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;

const readTemplate = (value: unknown): CategoryTemplate => {
  const data = isRecord(value) ? value : {};

  return {
    positive_prompt: readString(data.positive_prompt),
    negative_prompt: readString(data.negative_prompt),
    loras: readString(data.loras),
    image_path: readString(data.image_path),
    favorite: readBoolean(data.favorite),
    model: readString(data.model) || undefined,
  };
};

const parseCategoryFile = (value: unknown): CategoryFile => {
  const data = isRecord(value) ? value : {};
  const templatesRaw = isRecord(data.templates) ? data.templates : ({} as Record<string, unknown>);

  const templates = Object.fromEntries(
    Object.entries(templatesRaw).map(([templateId, templateData]) => [
      templateId,
      readTemplate(templateData),
    ])
  );

  return {
    placeId: readNumber(data.placeId),
    templates,
  };
};

export const loadCategories = (): CategoryDefinition[] => {
  const categories = Object.entries(categoryModules)
    .map(([filePath, moduleValue]) => {
      const fileNameMatch = filePath.match(/([^/\\]+)\.json$/);
      if (!fileNameMatch) {
        return null;
      }

      const categoryId = fileNameMatch[1];
      const categoryFile = parseCategoryFile(moduleValue);

      return {
        id: categoryId,
        title: humanizeCategoryName(categoryId),
        placeId: categoryFile.placeId,
        templates: Object.entries(categoryFile.templates)
          .map(([templateId, data]) => ({
            templateId,
            title: templateId,
            data,
          }))
          .sort((a, b) => a.title.localeCompare(b.title)),
      };
    })
    .filter((category): category is CategoryDefinition => Boolean(category));

  return categories.sort((a, b) => a.placeId - b.placeId || a.title.localeCompare(b.title));
};
