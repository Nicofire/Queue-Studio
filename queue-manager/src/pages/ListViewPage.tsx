import { useRef, useState } from 'react';

import { AddCategoryEntryModal } from '../components/AddCategoryEntryModal';
import { AddCategoryModal } from '../components/AddCategoryModal';
import { CategoryListTab } from '../components/CategoryListTab';
import {
  createCategoryEntryInProject,
  createCategoryInProject,
  renameCategoryInProject,
  reorderCategorysInProject,
  toggleCategoryEntryFavoriteInProject,
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
  const [entrySearch, setEntrySearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [draggingCategoryId, setDraggingCategoryId] = useState<string | null>(null);
  const [dropTargetCategoryId, setDropTargetCategoryId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);
  const [entryModalCategoryId, setEntryModalCategoryId] = useState<string | null>(null);
  const [entryModalError, setEntryModalError] = useState<string | null>(null);
  const [isSavingEntry, setIsSavingEntry] = useState(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const stripRef = useRef<HTMLElement | null>(null);

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
  const normalizedSearch = entrySearch.trim().toLowerCase();
  const matchingEntryCount = categories.reduce((accumulator, category) => {
    const matches = category.templates.filter((template) =>
      template.title.toLowerCase().includes(normalizedSearch)
    ).length;
    return accumulator + matches;
  }, 0);

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

  const reorderCategoryList = (
    current: CategoryDefinition[],
    draggedId: string,
    targetId: string,
    position: 'before' | 'after'
  ) => {
    const draggedIndex = current.findIndex((item) => item.id === draggedId);
    const targetIndex = current.findIndex((item) => item.id === targetId);

    if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
      return current;
    }

    const result = [...current];
    const [dragged] = result.splice(draggedIndex, 1);

    let insertIndex = targetIndex;
    if (draggedIndex < targetIndex) {
      insertIndex -= 1;
    }
    if (position === 'after') {
      insertIndex += 1;
    }

    result.splice(insertIndex, 0, dragged);

    return result.map((item, index) => ({
      ...item,
      placeId: index,
    }));
  };

  const persistCategoryOrder = async (orderedIds: string[]) => {
    await reorderCategorysInProject(orderedIds);
  };

  const handleHeaderDragStart = (event: React.DragEvent, categoryId: string) => {
    if (editingCategoryId) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', categoryId);
    setDraggingCategoryId(categoryId);
    setDropTargetCategoryId(null);
    setDropPosition(null);
    setDragError(null);
  };

  const handleHeaderDragEnd = () => {
    setDraggingCategoryId(null);
    setDropTargetCategoryId(null);
    setDropPosition(null);
  };

  const handleColumnDragOver = (event: React.DragEvent<HTMLElement>, targetCategoryId: string) => {
    if (!draggingCategoryId || draggingCategoryId === targetCategoryId) {
      return;
    }

    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    const nextPosition = event.clientX < midpoint ? 'before' : 'after';

    setDropTargetCategoryId(targetCategoryId);
    setDropPosition(nextPosition);
  };

  const handleColumnDrop = async (
    event: React.DragEvent<HTMLElement>,
    targetCategoryId: string
  ) => {
    event.preventDefault();

    const draggedId = draggingCategoryId ?? event.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === targetCategoryId) {
      return;
    }

    const position = dropPosition ?? 'before';
    const previous = categories;
    const reordered = reorderCategoryList(previous, draggedId, targetCategoryId, position);

    setCategories(reordered);
    setDropTargetCategoryId(null);
    setDropPosition(null);

    try {
      await persistCategoryOrder(reordered.map((item) => item.id));
    } catch (error) {
      setCategories(previous);
      if (error instanceof Error) {
        setDragError(error.message);
      } else {
        setDragError('Could not save category order.');
      }
    }
  };

  const handleStripDragOver = (event: React.DragEvent<HTMLElement>) => {
    if (!draggingCategoryId || !stripRef.current) {
      return;
    }

    event.preventDefault();

    const rect = stripRef.current.getBoundingClientRect();
    const edgeSize = Math.min(120, rect.width * 0.2);
    const scrollStep = 26;

    if (event.clientX < rect.left + edgeSize) {
      stripRef.current.scrollLeft -= scrollStep;
    } else if (event.clientX > rect.right - edgeSize) {
      stripRef.current.scrollLeft += scrollStep;
    }
  };

  const handleOpenAddEntryModal = (categoryId: string) => {
    setEntryModalError(null);
    setEntryModalCategoryId(categoryId);
  };

  const handleCloseAddEntryModal = () => {
    setEntryModalCategoryId(null);
    setEntryModalError(null);
  };

  const activeEntryCategory =
    entryModalCategoryId === null
      ? null
      : (categories.find((category) => category.id === entryModalCategoryId) ?? null);

  const handleSaveEntry = async (payload: {
    entryName: string;
    positive_prompt: string;
    negative_prompt: string;
    loras: string;
    model?: string;
    imageDataBase64?: string;
    imageOriginalName?: string;
  }) => {
    if (!activeEntryCategory) {
      setEntryModalError('Selected category was not found.');
      return;
    }

    const duplicated = activeEntryCategory.templates.some(
      (template) => template.templateId.toLowerCase() === payload.entryName.trim().toLowerCase()
    );

    if (duplicated) {
      setEntryModalError('An entry with this name already exists in this category.');
      return;
    }

    setEntryModalError(null);
    setIsSavingEntry(true);

    try {
      const created = await createCategoryEntryInProject({
        categoryId: activeEntryCategory.id,
        entryName: payload.entryName,
        positive_prompt: payload.positive_prompt,
        negative_prompt: payload.negative_prompt,
        loras: payload.loras,
        model: payload.model,
        imageDataBase64: payload.imageDataBase64,
        imageOriginalName: payload.imageOriginalName,
      });

      setCategories((current) =>
        current.map((category) => {
          if (category.id !== activeEntryCategory.id) {
            return category;
          }

          return {
            ...category,
            templates: [...category.templates, created].sort((a, b) =>
              a.title.localeCompare(b.title)
            ),
          };
        })
      );

      handleCloseAddEntryModal();
    } catch (error) {
      if (error instanceof Error) {
        setEntryModalError(error.message);
      } else {
        setEntryModalError('Could not create category entry.');
      }
    } finally {
      setIsSavingEntry(false);
    }
  };

  const handleToggleFavorite = async (
    categoryId: string,
    templateId: string,
    favorite: boolean
  ) => {
    setFavoriteError(null);

    const previous = categories;
    setCategories((current) =>
      current.map((category) => {
        if (category.id !== categoryId) {
          return category;
        }

        return {
          ...category,
          templates: category.templates.map((template) =>
            template.templateId === templateId
              ? {
                  ...template,
                  data: {
                    ...template.data,
                    favorite,
                  },
                }
              : template
          ),
        };
      })
    );

    try {
      await toggleCategoryEntryFavoriteInProject(categoryId, templateId, favorite);
    } catch (error) {
      setCategories(previous);
      if (error instanceof Error) {
        setFavoriteError(error.message);
      } else {
        setFavoriteError('Could not update favorite state.');
      }
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

      <div className="category-search-row">
        <label className="field-group" htmlFor="category-entry-search">
          <span className="field-label">Search Entries</span>
          <input
            id="category-entry-search"
            className="text-input"
            type="text"
            placeholder="Search entry name across all categories..."
            value={entrySearch}
            onChange={(event) => setEntrySearch(event.target.value)}
          />
        </label>
        {normalizedSearch ? (
          <p className="field-hint">Matches: {matchingEntryCount}</p>
        ) : (
          <p className="field-hint">Showing all entries.</p>
        )}
      </div>

      <section
        ref={stripRef}
        className="category-columns-strip"
        aria-label="Category template columns"
        onDragOver={handleStripDragOver}
      >
        {categories.map((category) => (
          <article
            className={[
              'category-column',
              draggingCategoryId === category.id ? 'is-dragging' : '',
              dropTargetCategoryId === category.id && dropPosition === 'before'
                ? 'is-drop-before'
                : '',
              dropTargetCategoryId === category.id && dropPosition === 'after'
                ? 'is-drop-after'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={category.id}
            onDragOver={(event) => handleColumnDragOver(event, category.id)}
            onDrop={(event) => void handleColumnDrop(event, category.id)}
          >
            <header className="category-column-head">
              <div className="category-column-head-row">
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
                    draggable={editingCategoryId === null}
                    onDragStart={(event) => handleHeaderDragStart(event, category.id)}
                    onDragEnd={handleHeaderDragEnd}
                  >
                    {category.title}
                  </h3>
                )}
                {editingCategoryId !== category.id ? (
                  <button
                    type="button"
                    className="category-add-entry-button"
                    onClick={() => handleOpenAddEntryModal(category.id)}
                    title={`Add entry to ${category.title}`}
                    aria-label={`Add entry to ${category.title}`}
                  >
                    +
                  </button>
                ) : null}
              </div>
              <p className="field-hint">placeId: {category.placeId}</p>
            </header>

            <div className="category-column-list">
              <CategoryListTab
                category={category}
                selectedTemplateIds={selectionByCategory[category.id] ?? []}
                onToggleTemplate={toggleTemplate}
                onToggleFavorite={handleToggleFavorite}
                searchQuery={entrySearch}
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
        {dragError ? <p className="field-hint is-error">{dragError}</p> : null}
        {favoriteError ? <p className="field-hint is-error">{favoriteError}</p> : null}
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

      {activeEntryCategory ? (
        <AddCategoryEntryModal
          isOpen={Boolean(activeEntryCategory)}
          categoryTitle={activeEntryCategory.title}
          errorMessage={entryModalError}
          isSaving={isSavingEntry}
          onClose={handleCloseAddEntryModal}
          onSave={handleSaveEntry}
        />
      ) : null}
    </>
  );
}
