import { CheckCheck, Plus, Star } from 'lucide-react';
import { useState, type Dispatch, type SetStateAction } from 'react';

import { CategoryEntryModal } from '../components/CategoryEntryModal';
import { CategoryQueueSummary } from '../components/CategoryQueueSummary';
import { CategoryTab } from '../components/CategoryTab';
import { CategoryTileTab } from '../components/CategoryTileTab';
import { filterCategoryTemplates } from '../features/categories/categoryFilters';
import type {
  CategoryDefinition,
  CategorySelectionMap,
} from '../features/categories/categoryTypes';
import { useCategoryEntryActions } from '../features/categories/useCategoryEntryActions';
import { toggleSelectAllInCategory } from '../features/categories/useCategorySelection';
import type { GenerationSettings } from '../features/settings/generationSettings';

type TileViewPageProps = {
  categories: CategoryDefinition[];
  setCategories: Dispatch<SetStateAction<CategoryDefinition[]>>;
  selectionByCategory: CategorySelectionMap;
  setSelectionByCategory: Dispatch<SetStateAction<CategorySelectionMap>>;
  toggleTemplate: (categoryId: string, templateId: string) => void;
  generationSettings: GenerationSettings;
  generationBusy: boolean;
};

const getDefaultActiveCategoryId = (categories: CategoryDefinition[]) => categories[0]?.id ?? '';

export function TileViewPage({
  categories,
  setCategories,
  selectionByCategory,
  setSelectionByCategory,
  toggleTemplate,
  generationSettings,
  generationBusy,
}: TileViewPageProps) {
  const [activeCategoryId, setActiveCategoryId] = useState(() =>
    getDefaultActiveCategoryId(categories)
  );
  const [entrySearch, setEntrySearch] = useState('');
  const [favoriteOnly, setFavoriteOnly] = useState(false);

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

  const activeCategoryIdForRender = categories.some((category) => category.id === activeCategoryId)
    ? activeCategoryId
    : getDefaultActiveCategoryId(categories);

  const handleToggleSelectAll = (category: CategoryDefinition) => {
    const visibleTemplateIds = filterCategoryTemplates(category, entrySearch, favoriteOnly).map(
      (template) => template.templateId
    );

    setSelectionByCategory((current) =>
      toggleSelectAllInCategory(current, category.id, visibleTemplateIds)
    );
  };

  return (
    <>
      <CategoryTab
        categories={categories}
        activeCategoryId={activeCategoryIdForRender}
        onCategoryChange={setActiveCategoryId}
      >
        {(activeCategory) => {
          const visibleTemplates = filterCategoryTemplates(
            activeCategory,
            entrySearch,
            favoriteOnly
          );
          const selectedTemplateIds = selectionByCategory[activeCategory.id] ?? [];
          const allVisibleSelected =
            visibleTemplates.length > 0 &&
            visibleTemplates.every((template) => selectedTemplateIds.includes(template.templateId));

          return (
            <>
              <div className="tile-toolbar">
                <label className="field-group" htmlFor="tile-entry-search">
                  <span className="field-label">Search {activeCategory.title}</span>
                  <input
                    id="tile-entry-search"
                    className="text-input"
                    type="text"
                    placeholder="Search entry name..."
                    value={entrySearch}
                    onChange={(event) => setEntrySearch(event.target.value)}
                  />
                </label>

                <div className="tile-toolbar-actions">
                  <button
                    type="button"
                    className={allVisibleSelected ? 'toggle-button is-active' : 'toggle-button'}
                    onClick={() => handleToggleSelectAll(activeCategory)}
                    aria-pressed={allVisibleSelected}
                  >
                    <CheckCheck size={15} /> Select all
                  </button>
                  <button
                    type="button"
                    className={favoriteOnly ? 'toggle-button is-active' : 'toggle-button'}
                    onClick={() => setFavoriteOnly((current) => !current)}
                    aria-pressed={favoriteOnly}
                  >
                    <Star size={15} /> Favorites
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => openAddEntryModal(activeCategory.id)}
                  >
                    <Plus size={16} /> Add entry
                  </button>
                  <p className="field-hint">
                    {visibleTemplates.length} of {activeCategory.templates.length} entries
                  </p>
                </div>
              </div>

              <CategoryTileTab
                category={activeCategory}
                selectedTemplateIds={selectedTemplateIds}
                searchQuery={entrySearch}
                favoriteOnly={favoriteOnly}
                onToggleTemplate={toggleTemplate}
                onToggleFavorite={toggleFavorite}
                onEditTemplate={openEditEntryModal}
              />
            </>
          );
        }}
      </CategoryTab>

      <CategoryQueueSummary
        categories={categories}
        selectionByCategory={selectionByCategory}
        errorMessages={[favoriteError]}
      />

      {entryModalCategory ? (
        <CategoryEntryModal
          key={`${entryModalCategory.id}:${entryModalTemplateId ?? 'new'}`}
          mode={entryModalTemplateId ? 'edit' : 'create'}
          categoryTitle={entryModalCategory.title}
          entry={entryModalTemplate}
          generationSettings={generationSettings}
          generationBusy={generationBusy}
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
