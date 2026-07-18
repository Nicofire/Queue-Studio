import { useState } from 'react';

import { CategoryQueueSummary } from '../components/CategoryQueueSummary';
import { CategoryTab } from '../components/CategoryTab';
import { CategoryTileTab } from '../components/CategoryTileTab';
import type {
  CategoryDefinition,
  CategorySelectionMap,
} from '../features/categories/categoryTypes';

type TileViewPageProps = {
  categories: CategoryDefinition[];
  selectionByCategory: CategorySelectionMap;
  toggleTemplate: (categoryId: string, templateId: string) => void;
};

const getDefaultActiveCategoryId = (categories: CategoryDefinition[]) => categories[0]?.id ?? '';

export function TileViewPage({
  categories,
  selectionByCategory,
  toggleTemplate,
}: TileViewPageProps) {
  const [activeCategoryId, setActiveCategoryId] = useState(() =>
    getDefaultActiveCategoryId(categories)
  );
  const activeCategoryIdForRender = categories.some((category) => category.id === activeCategoryId)
    ? activeCategoryId
    : getDefaultActiveCategoryId(categories);

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
        activeCategoryId={activeCategoryIdForRender}
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

      <CategoryQueueSummary categories={categories} selectionByCategory={selectionByCategory} />
    </>
  );
}
