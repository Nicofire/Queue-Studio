import type { CategoryDefinition, CategoryTemplateEntry } from './categoryTypes';

export function filterCategoryTemplates(
  category: CategoryDefinition,
  searchQuery: string,
  favoriteOnly: boolean
): CategoryTemplateEntry[] {
  const normalizedSearch = searchQuery.trim().toLowerCase();

  return category.templates.filter((template) => {
    if (normalizedSearch && !template.title.toLowerCase().includes(normalizedSearch)) {
      return false;
    }

    if (favoriteOnly && !template.data.favorite) {
      return false;
    }

    return true;
  });
}
