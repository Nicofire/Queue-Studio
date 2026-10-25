import type { ReactNode } from 'react';

import type { CategoryDefinition } from '../features/categories/categoryTypes';

type CategoryTabProps = {
  categories: CategoryDefinition[];
  activeCategoryId: string;
  onCategoryChange: (categoryId: string) => void;
  children: (activeCategory: CategoryDefinition) => ReactNode;
};

export function CategoryTab({
  categories,
  activeCategoryId,
  onCategoryChange,
  children,
}: CategoryTabProps) {
  if (categories.length === 0) {
    return (
      <section className="category-panel" aria-live="polite">
        <p className="field-hint is-error">No category files were found in data/categorys.</p>
      </section>
    );
  }

  const activeCategory =
    categories.find((category) => category.id === activeCategoryId) ?? categories[0];

  return (
    <section className="category-panel" aria-live="polite">
      <nav className="category-tab-list" aria-label="Prompt categories">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className={
              category.id === activeCategory.id
                ? 'category-tab-button is-active'
                : 'category-tab-button'
            }
            onClick={() => onCategoryChange(category.id)}
          >
            <span>{category.title}</span>
            <small>#{category.placeId}</small>
          </button>
        ))}
      </nav>

      <div className="category-tab-content">{children(activeCategory)}</div>
    </section>
  );
}
