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
