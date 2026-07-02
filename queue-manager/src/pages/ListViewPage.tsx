import { useMemo, useState } from 'react';

import { CategoryListTab } from '../components/CategoryListTab';
import { CategoryTab } from '../components/CategoryTab';
import { loadCategories } from '../features/categories/categoryData';
import type { CategorySelectionMap } from '../features/categories/categoryTypes';
import {
  buildQueueCombinations,
  getQueueCombinationCount,
} from '../features/categories/queueBuilder';

const categories = loadCategories();

const getDefaultActiveCategoryId = () => categories[0]?.id ?? '';

export function ListViewPage() {
  const [activeCategoryId, setActiveCategoryId] = useState(getDefaultActiveCategoryId);
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

  const queueCount = getQueueCombinationCount(categories, selectionByCategory);
  const queuePreview = useMemo(
    () => buildQueueCombinations(categories, selectionByCategory).slice(0, 5),
    [selectionByCategory]
  );

  return (
    <>
      <p className="panel-label">List View</p>
      <h2>Categories by placeId</h2>
      <p className="subtitle">
        Categories and queue build order are both controlled by placeId from data/categorys/*.json.
      </p>

      <CategoryTab
        categories={categories}
        activeCategoryId={activeCategoryId}
        onCategoryChange={setActiveCategoryId}
      >
        {(activeCategory) => (
          <CategoryListTab
            category={activeCategory}
            selectedTemplateIds={selectionByCategory[activeCategory.id] ?? []}
            onToggleTemplate={toggleTemplate}
          />
        )}
      </CategoryTab>

      <section className="queue-summary">
        <p className="field-hint">
          Queue build order: {categories.map((category) => category.title).join(' -> ')}
        </p>
        <p className="field-hint">
          Generated queue combinations with current selections: {queueCount}
        </p>
        <pre className="queue-preview">{JSON.stringify(queuePreview, null, 2)}</pre>
      </section>
    </>
  );
}
