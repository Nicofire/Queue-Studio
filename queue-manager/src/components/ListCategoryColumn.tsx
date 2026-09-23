import { filterCategoryTemplates } from '../features/categories/categoryFilters';
import type { CategoryDefinition } from '../features/categories/categoryTypes';
import { CategoryListTab } from './CategoryListTab';

type ListCategoryColumnProps = {
  category: CategoryDefinition;
  selectedTemplateIds: string[];
  searchQuery: string;
  favoriteOnly: boolean;
  isDragging: boolean;
  dropPosition: 'before' | 'after' | null;
  isEditing: boolean;
  editingCategoryName: string;
  isRenaming: boolean;
  renameError: string | null;
  onStartRename: () => void;
  onEditingCategoryNameChange: (value: string) => void;
  onCancelRename: () => void;
  onSubmitRename: () => void;
  onHeaderDragStart: (event: React.DragEvent, categoryId: string) => void;
  onHeaderDragEnd: () => void;
  onColumnDragOver: (event: React.DragEvent<HTMLElement>, categoryId: string) => void;
  onColumnDrop: (event: React.DragEvent<HTMLElement>, categoryId: string) => void;
  onOpenAddEntryModal: () => void;
  onToggleSelectAll: () => void;
  onToggleFavoriteOnly: () => void;
  onToggleTemplate: (categoryId: string, templateId: string) => void;
  onToggleFavorite: (categoryId: string, templateId: string, favorite: boolean) => void;
  onEditTemplate: (categoryId: string, templateId: string) => void;
};

export function ListCategoryColumn({
  category,
  selectedTemplateIds,
  searchQuery,
  favoriteOnly,
  isDragging,
  dropPosition,
  isEditing,
  editingCategoryName,
  isRenaming,
  renameError,
  onStartRename,
  onEditingCategoryNameChange,
  onCancelRename,
  onSubmitRename,
  onHeaderDragStart,
  onHeaderDragEnd,
  onColumnDragOver,
  onColumnDrop,
  onOpenAddEntryModal,
  onToggleSelectAll,
  onToggleFavoriteOnly,
  onToggleTemplate,
  onToggleFavorite,
  onEditTemplate,
}: ListCategoryColumnProps) {
  const visibleTemplates = filterCategoryTemplates(category, searchQuery, favoriteOnly);
  const allVisibleSelected =
    visibleTemplates.length > 0 &&
    visibleTemplates.every((template) => selectedTemplateIds.includes(template.templateId));

  return (
    <article
      className={[
        'category-column',
        isDragging ? 'is-dragging' : '',
        dropPosition === 'before' ? 'is-drop-before' : '',
        dropPosition === 'after' ? 'is-drop-after' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onDragOver={(event) => onColumnDragOver(event, category.id)}
      onDrop={(event) => void onColumnDrop(event, category.id)}
    >
      <header className="category-column-head">
        <div className="category-column-head-row">
          {isEditing ? (
            <div className="category-rename-inline">
              <input
                className="text-input category-rename-input"
                type="text"
                value={editingCategoryName}
                onChange={(event) => onEditingCategoryNameChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    onSubmitRename();
                  }
                  if (event.key === 'Escape') {
                    onCancelRename();
                  }
                }}
                autoFocus
              />
              <div className="category-rename-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={isRenaming}
                  onClick={onSubmitRename}
                >
                  {isRenaming ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={isRenaming}
                  onClick={onCancelRename}
                >
                  Cancel
                </button>
              </div>
              {renameError ? <p className="field-hint is-error">{renameError}</p> : null}
            </div>
          ) : (
            <h3
              className="category-title-editable"
              onDoubleClick={onStartRename}
              title="Double click to rename category"
              draggable
              onDragStart={(event) => onHeaderDragStart(event, category.id)}
              onDragEnd={onHeaderDragEnd}
            >
              {category.title}
            </h3>
          )}
          {!isEditing ? (
            <button
              type="button"
              className="category-add-entry-button"
              onClick={onOpenAddEntryModal}
              title={`Add entry to ${category.title}`}
              aria-label={`Add entry to ${category.title}`}
            >
              +
            </button>
          ) : null}
        </div>
        <div className="category-column-filters">
          <button
            type="button"
            className={allVisibleSelected ? 'toggle-button is-active' : 'toggle-button'}
            onClick={onToggleSelectAll}
          >
            Select All
          </button>
          <button
            type="button"
            className={favoriteOnly ? 'toggle-button is-active' : 'toggle-button'}
            onClick={onToggleFavoriteOnly}
          >
            Favorit only
          </button>
        </div>
      </header>

      <div className="category-column-list">
        <CategoryListTab
          category={category}
          selectedTemplateIds={selectedTemplateIds}
          onToggleTemplate={onToggleTemplate}
          onToggleFavorite={onToggleFavorite}
          onEditTemplate={onEditTemplate}
          favoriteOnly={favoriteOnly}
          searchQuery={searchQuery}
        />
      </div>
    </article>
  );
}
