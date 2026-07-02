import { useState } from 'react';

import { CategoryTab } from '../components/CategoryTab';
import { CategoryTileTab } from '../components/CategoryTileTab';
import { loadCategories } from '../features/categories/categoryData';
import type { CategorySelectionMap } from '../features/categories/categoryTypes';
import { getQueueCombinationCount } from '../features/categories/queueBuilder';

const categories = loadCategories();

const getDefaultActiveCategoryId = () => categories[0]?.id ?? '';

export function TileViewPage() {
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

  return (
    <>
      <p className="panel-label">Tile View</p>
      <h2>Category tiles with shared tab logic</h2>
      <p className="subtitle">
        Same category source and queue ordering as list view, but with a tile component for visual
        browsing.
      </p>

      <CategoryTab
        categories={categories}
        activeCategoryId={activeCategoryId}
        onCategoryChange={setActiveCategoryId}
      >
        {(activeCategory) => (
          <CategoryTileTab
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
      </section>
    </>
  );
}
