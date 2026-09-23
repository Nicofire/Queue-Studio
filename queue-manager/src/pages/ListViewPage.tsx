import { useRef, useState, type Dispatch, type SetStateAction } from 'react';

import { AddCategoryModal } from '../components/AddCategoryModal';
import { CategoryEntryModal } from '../components/CategoryEntryModal';
import { CategoryQueueSummary } from '../components/CategoryQueueSummary';
import { ListCategoryColumn } from '../components/ListCategoryColumn';
import {
  createCategoryInProject,
  renameCategoryInProject,
  reorderCategorysInProject,
} from '../features/categories/categoryApi';
import { filterCategoryTemplates } from '../features/categories/categoryFilters';
import type {
  CategoryDefinition,
  CategorySelectionMap,
} from '../features/categories/categoryTypes';
import { useCategoryEntryActions } from '../features/categories/useCategoryEntryActions';
import { toggleSelectAllInCategory } from '../features/categories/useCategorySelection';

const getNextPlaceId = (categories: CategoryDefinition[]) =>
  categories.length === 0 ? 0 : Math.max(...categories.map((category) => category.placeId)) + 1;

type ListViewPageProps = {
  categories: CategoryDefinition[];
  setCategories: Dispatch<SetStateAction<CategoryDefinition[]>>;
  selectionByCategory: CategorySelectionMap;
  setSelectionByCategory: Dispatch<SetStateAction<CategorySelectionMap>>;
  toggleTemplate: (categoryId: string, templateId: string) => void;
  automaticApiUrl: string;
};

export function ListViewPage({
  categories,
  setCategories,
  selectionByCategory,
  setSelectionByCategory,
  toggleTemplate,
  automaticApiUrl,
}: ListViewPageProps) {
  const [favoriteOnlyByCategory, setFavoriteOnlyByCategory] = useState<Record<string, boolean>>({});
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
  const stripRef = useRef<HTMLElement | null>(null);

  const {
    entryModalCategory,
    entryModalTemplate,
    entryModalTemplateId,
    entryModalError,
    isSavingEntry,
    isDeletingEntry,
    favoriteError,
    openAddEntryModal,
    openEditEntryModal,
    closeEntryModal,
    saveEntry,
    deleteEntry,
    toggleFavorite,
  } = useCategoryEntryActions({ categories, setCategories, setSelectionByCategory });

  const normalizedSearch = entrySearch.trim().toLowerCase();
  const matchingEntryCount = categories.reduce((accumulator, category) => {
    const matches = category.templates.filter((template) =>
      template.title.toLowerCase().includes(normalizedSearch)
    ).length;
    return accumulator + matches;
  }, 0);

  const getVisibleTemplates = (category: CategoryDefinition) => {
    return filterCategoryTemplates(
      category,
      normalizedSearch,
      favoriteOnlyByCategory[category.id] === true
    );
  };

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
    openAddEntryModal(categoryId);
  };

  const handleToggleFavoriteOnly = (categoryId: string) => {
    setFavoriteOnlyByCategory((current) => ({
      ...current,
      [categoryId]: !current[categoryId],
    }));
  };

  const handleToggleSelectAll = (category: CategoryDefinition) => {
    const visibleTemplateIds = getVisibleTemplates(category).map((template) => template.templateId);

    setSelectionByCategory((current) =>
      toggleSelectAllInCategory(current, category.id, visibleTemplateIds)
    );
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
          <ListCategoryColumn
            key={category.id}
            category={category}
            selectedTemplateIds={selectionByCategory[category.id] ?? []}
            searchQuery={entrySearch}
            favoriteOnly={favoriteOnlyByCategory[category.id] === true}
            isDragging={draggingCategoryId === category.id}
            dropPosition={dropTargetCategoryId === category.id ? dropPosition : null}
            isEditing={editingCategoryId === category.id}
            editingCategoryName={editingCategoryName}
            isRenaming={renamingCategoryId === category.id}
            renameError={renameError}
            onStartRename={() => handleStartRename(category)}
            onEditingCategoryNameChange={setEditingCategoryName}
            onCancelRename={handleCancelRename}
            onSubmitRename={() => void handleSubmitRename(category)}
            onHeaderDragStart={handleHeaderDragStart}
            onHeaderDragEnd={handleHeaderDragEnd}
            onColumnDragOver={handleColumnDragOver}
            onColumnDrop={handleColumnDrop}
            onOpenAddEntryModal={() => handleOpenAddEntryModal(category.id)}
            onToggleSelectAll={() => handleToggleSelectAll(category)}
            onToggleFavoriteOnly={() => handleToggleFavoriteOnly(category.id)}
            onToggleTemplate={toggleTemplate}
            onToggleFavorite={toggleFavorite}
            onEditTemplate={openEditEntryModal}
          />
        ))}
      </section>

      <CategoryQueueSummary
        categories={categories}
        selectionByCategory={selectionByCategory}
        errorMessages={[dragError, favoriteError]}
      />

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

      {entryModalCategory ? (
        <CategoryEntryModal
          key={`${entryModalCategory.id}:${entryModalTemplateId ?? 'new'}`}
          mode={entryModalTemplateId ? 'edit' : 'create'}
          categoryTitle={entryModalCategory.title}
          entry={entryModalTemplate}
          automaticApiUrl={automaticApiUrl}
          errorMessage={entryModalError}
          isSaving={isSavingEntry}
          isDeleting={isDeletingEntry}
          onClose={closeEntryModal}
          onSave={saveEntry}
          onDelete={deleteEntry}
        />
      ) : null}
    </>
  );
}
