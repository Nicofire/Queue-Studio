import { useState } from 'react';

import type { CategorySelectionMap } from './categoryTypes';

export function useCategorySelection() {
  const [selectionByCategory, setSelectionByCategory] = useState<CategorySelectionMap>({});

  const toggleTemplate = (categoryId: string, templateId: string) => {
    setSelectionByCategory((current) => {
      const selectedTemplateIds = current[categoryId] ?? [];
      const nextTemplateIds = selectedTemplateIds.includes(templateId)
        ? selectedTemplateIds.filter((item) => item !== templateId)
        : [...selectedTemplateIds, templateId];

      return {
        ...current,
        [categoryId]: nextTemplateIds,
      };
    });
  };

  return {
    selectionByCategory,
    setSelectionByCategory,
    toggleTemplate,
  };
}

/** Selects every visible template, or clears them when all are already selected. */
export const toggleSelectAllInCategory = (
  current: CategorySelectionMap,
  categoryId: string,
  visibleTemplateIds: string[]
): CategorySelectionMap => {
  if (visibleTemplateIds.length === 0) {
    return current;
  }

  const selectedTemplateIds = current[categoryId] ?? [];
  const allVisibleSelected = visibleTemplateIds.every((templateId) =>
    selectedTemplateIds.includes(templateId)
  );

  if (allVisibleSelected) {
    return {
      ...current,
      [categoryId]: selectedTemplateIds.filter(
        (templateId) => !visibleTemplateIds.includes(templateId)
      ),
    };
  }

  return {
    ...current,
    [categoryId]: Array.from(new Set([...selectedTemplateIds, ...visibleTemplateIds])),
  };
};
