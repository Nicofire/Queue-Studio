import { useState } from 'react';

import { AddCategoryModal } from '../components/AddCategoryModal';
import { CategoryListTab } from '../components/CategoryListTab';
import { createCategoryInProject } from '../features/categories/categoryApi';
import { loadCategories } from '../features/categories/categoryData';
import type {
  CategoryDefinition,
  CategorySelectionMap,
} from '../features/categories/categoryTypes';
import { getQueueCombinationCount } from '../features/categories/queueBuilder';

const getNextPlaceId = (categories: CategoryDefinition[]) =>
  categories.length === 0 ? 0 : Math.max(...categories.map((category) => category.placeId)) + 1;

export function ListViewPage() {
  const [categories, setCategories] = useState<CategoryDefinition[]>(() => loadCategories());
  const [selectionByCategory, setSelectionByCategory] = useState<CategorySelectionMap>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [isSavingCategory, setIsSavingCategory] = useState(false);

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

  const handleOpenAddModal = () => {
    setAddError(null);
    setShowAddModal(true);
  };

  const handleCloseAddModal = () => {
    setShowAddModal(false);
    setAddError(null);
  };

  const handleSaveCategory = async (name: string) => {
    const trimmedName = name.trim();
    const existingCategory = categories.some(
      (category) => category.title.toLowerCase() === trimmedName.toLowerCase()
    );

    if (existingCategory) {
      setAddError('A category with this name already exists.');
      return;
    }

    setIsSavingCategory(true);
    setAddError(null);

    try {
      const created = await createCategoryInProject(trimmedName);

      setCategories((current) => {
        const alreadyThere = current.some((category) => category.id === created.id);
        if (alreadyThere) {
          return current;
        }

        const next = [
          ...current,
          {
            id: created.id,
            title: created.title,
            placeId: created.placeId,
            templates: [],
          },
        ];

        return next.sort((a, b) => a.placeId - b.placeId || a.title.localeCompare(b.title));
      });

      handleCloseAddModal();
    } catch (error) {
      if (error instanceof Error) {
        setAddError(error.message);
      } else {
        setAddError('Could not create category file.');
      }
    } finally {
      setIsSavingCategory(false);
    }
  };

  return (
    <>
      <p className="panel-label">List View</p>
      <h2>Category columns by placeId</h2>
      <p className="subtitle">
        Every category is shown as its own column, ordered by placeId from data/categorys/*.json.
      </p>

      <div className="category-strip-toolbar">
        <p className="field-hint">Next available placeId: {getNextPlaceId(categories)} (0 based)</p>
        <button className="secondary-button" type="button" onClick={handleOpenAddModal}>
          + Add Category
        </button>
      </div>

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

      {showAddModal ? (
        <AddCategoryModal
          isOpen={showAddModal}
          errorMessage={addError}
          isSaving={isSavingCategory}
          onClose={handleCloseAddModal}
          onSave={handleSaveCategory}
        />
      ) : null}
    </>
  );
}
