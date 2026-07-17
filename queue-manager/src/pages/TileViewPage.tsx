import { useState } from 'react';

import { CategoryQueueSummary } from '../components/CategoryQueueSummary';
import { CategoryTab } from '../components/CategoryTab';
import { CategoryTileTab } from '../components/CategoryTileTab';
import { loadCategories } from '../features/categories/categoryData';
import { useCategorySelection } from '../features/categories/useCategorySelection';

const categories = loadCategories();

const getDefaultActiveCategoryId = () => categories[0]?.id ?? '';

export function TileViewPage() {
  const [activeCategoryId, setActiveCategoryId] = useState(getDefaultActiveCategoryId);
  const { selectionByCategory, toggleTemplate } = useCategorySelection();

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

      <CategoryQueueSummary categories={categories} selectionByCategory={selectionByCategory} />
    </>
  );
}
