import { useState } from 'react';

import { CategoryListTab } from '../components/CategoryListTab';
import { loadCategories } from '../features/categories/categoryData';
import type { CategorySelectionMap } from '../features/categories/categoryTypes';
import { getQueueCombinationCount } from '../features/categories/queueBuilder';

const categories = loadCategories();

export function ListViewPage() {
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
      <p className="panel-label">List View</p>
      <h2>Category columns by placeId</h2>
      <p className="subtitle">
        Every category is shown as its own column, ordered by placeId from data/categorys/*.json.
      </p>

      <section className="category-columns-strip" aria-label="Category template columns">
        {categories.map((category) => (
          <article className="category-column" key={category.id}>
            <header className="category-column-head">
              <h3>{category.title}</h3>
              <p className="field-hint">placeId: {category.placeId}</p>
            </header>

            <div className="category-column-list">
              <CategoryListTab
                category={category}
                selectedTemplateIds={selectionByCategory[category.id] ?? []}
                onToggleTemplate={toggleTemplate}
              />
            </div>
          </article>
        ))}
      </section>

      <section className="queue-summary">
        <p className="field-hint">
          Queue build order: {categories.map((category) => category.title).join(' -> ')}
        </p>
        <p className="field-hint">
          Generated queue combinations with current selections: {queueCount}
        </p>
      </section>

      {categories.length === 0 ? (
        <section className="queue-summary">
          <p className="field-hint is-error">No category files found in data/categorys.</p>
        </section>
      ) : null}
    </>
  );
}
