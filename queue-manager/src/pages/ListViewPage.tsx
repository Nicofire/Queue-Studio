import { useState } from 'react';

import { AddCategoryModal } from '../components/AddCategoryModal';
import { CategoryListTab } from '../components/CategoryListTab';
import {
  createCategoryInProject,
  renameCategoryInProject,
} from '../features/categories/categoryApi';
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
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);

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

  const handleStartRename = (category: CategoryDefinition) => {
    setRenameError(null);
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.title);
  };

  const handleCancelRename = () => {
    setEditingCategoryId(null);
    setEditingCategoryName('');
    setRenameError(null);
  };

  const handleSubmitRename = async (category: CategoryDefinition) => {
    const newName = editingCategoryName.trim();
    if (!newName) {
      setRenameError('Category name is required.');
      return;
    }

    const duplicated = categories.some(
      (item) => item.id !== category.id && item.title.toLowerCase() === newName.toLowerCase()
    );

    if (duplicated) {
      setRenameError('A category with this name already exists.');
      return;
    }

    setRenamingCategoryId(category.id);
    setRenameError(null);

    try {
      const renamed = await renameCategoryInProject(category.id, newName);

      setCategories((current) =>
        current
          .map((item) => {
            if (item.id !== renamed.oldId) {
              return item;
            }

            return {
              ...item,
              id: renamed.id,
              title: renamed.title,
              placeId: renamed.placeId,
            };
          })
          .sort((a, b) => a.placeId - b.placeId || a.title.localeCompare(b.title))
      );

      setSelectionByCategory((current) => {
        if (renamed.oldId === renamed.id || !current[renamed.oldId]) {
          return current;
        }

        const { [renamed.oldId]: movedSelection, ...rest } = current;
        return {
          ...rest,
          [renamed.id]: movedSelection,
        };
      });

      handleCancelRename();
    } catch (error) {
      if (error instanceof Error) {
        setRenameError(error.message);
      } else {
        setRenameError('Could not rename category file.');
      }
    } finally {
      setRenamingCategoryId(null);
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
              {editingCategoryId === category.id ? (
                <div className="category-rename-inline">
                  <input
                    className="text-input category-rename-input"
                    type="text"
                    value={editingCategoryName}
                    onChange={(event) => setEditingCategoryName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        void handleSubmitRename(category);
                      }
                      if (event.key === 'Escape') {
                        handleCancelRename();
                      }
                    }}
                    autoFocus
                  />
                  <div className="category-rename-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={renamingCategoryId === category.id}
                      onClick={() => void handleSubmitRename(category)}
                    >
                      {renamingCategoryId === category.id ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={renamingCategoryId === category.id}
                      onClick={handleCancelRename}
                    >
                      Cancel
                    </button>
                  </div>
                  {renameError ? <p className="field-hint is-error">{renameError}</p> : null}
                </div>
              ) : (
                <h3
                  className="category-title-editable"
                  onDoubleClick={() => handleStartRename(category)}
                  title="Double click to rename category"
                >
                  {category.title}
                </h3>
              )}
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
