import { useState } from 'react';

import { filterCategoryTemplates } from '../features/categories/categoryFilters';
import type {
  CategoryDefinition,
  CategoryTemplateEntry,
} from '../features/categories/categoryTypes';

type CategoryTileTabProps = {
  category: CategoryDefinition;
  selectedTemplateIds: string[];
  searchQuery?: string;
  favoriteOnly?: boolean;
  onToggleTemplate: (categoryId: string, templateId: string) => void;
  onToggleFavorite: (categoryId: string, templateId: string, favorite: boolean) => void;
  onEditTemplate: (categoryId: string, templateId: string) => void;
};

const mapImagePath = (imagePath: string) => {
  if (!imagePath || imagePath === 'image.png') {
    return '';
  }

  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }

  return imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
};

function CategoryTile({
  category,
  template,
  isSelected,
  onToggleTemplate,
  onToggleFavorite,
  onEditTemplate,
}: {
  category: CategoryDefinition;
  template: CategoryTemplateEntry;
  isSelected: boolean;
  onToggleTemplate: (categoryId: string, templateId: string) => void;
  onToggleFavorite: (categoryId: string, templateId: string, favorite: boolean) => void;
  onEditTemplate: (categoryId: string, templateId: string) => void;
}) {
  const [imageVisible, setImageVisible] = useState(Boolean(template.data.image_path));
  const imageSrc = mapImagePath(template.data.image_path);
  const toggleSelection = () => onToggleTemplate(category.id, template.templateId);

  return (
    <article
      className={isSelected ? 'category-tile is-selected' : 'category-tile'}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`${isSelected ? 'Deselect' : 'Select'} ${template.title}`}
      onClick={toggleSelection}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleSelection();
        }
      }}
    >
      {isSelected ? (
        <span className="category-tile-selected-badge" aria-hidden="true">
          ✓
        </span>
      ) : null}

      {imageVisible && imageSrc ? (
        <img
          className="category-tile-image"
          src={imageSrc}
          alt={template.title}
          loading="lazy"
          onError={() => setImageVisible(false)}
        />
      ) : (
        <div className="category-tile-image placeholder" aria-hidden="true">
          No preview
        </div>
      )}

      <div className="category-tile-body">
        <div className="category-tile-title-row">
          <h3>{template.title}</h3>

          <span className="category-tile-actions">
            <button
              type="button"
              className={
                template.data.favorite
                  ? 'favorite-toggle-button is-active'
                  : 'favorite-toggle-button'
              }
              aria-label={
                template.data.favorite
                  ? `Remove ${template.title} from favorites`
                  : `Mark ${template.title} as favorite`
              }
              title={template.data.favorite ? 'Favorite entry' : 'Mark as favorite'}
              onClick={(event) => {
                event.stopPropagation();
                onToggleFavorite(category.id, template.templateId, !template.data.favorite);
              }}
            >
              {template.data.favorite ? '★' : '☆'}
            </button>

            <button
              type="button"
              className="entry-edit-button"
              aria-label={`Edit ${template.title}`}
              title={`Edit ${template.title}`}
              onClick={(event) => {
                event.stopPropagation();
                onEditTemplate(category.id, template.templateId);
              }}
            >
              ✎
            </button>
          </span>
        </div>

        <p className="field-hint category-tile-prompt" title={template.data.positive_prompt || ''}>
          {template.data.positive_prompt || 'No positive prompt'}
        </p>
      </div>
    </article>
  );
}

export function CategoryTileTab({
  category,
  selectedTemplateIds,
  searchQuery = '',
  favoriteOnly = false,
  onToggleTemplate,
  onToggleFavorite,
  onEditTemplate,
}: CategoryTileTabProps) {
  const visibleTemplates = filterCategoryTemplates(category, searchQuery, favoriteOnly);

  if (visibleTemplates.length === 0) {
    return <p className="category-empty-state">No matching entries in this category.</p>;
  }

  return (
    <div className="category-tile-grid">
      {visibleTemplates.map((template) => (
        <CategoryTile
          key={template.templateId}
          category={category}
          template={template}
          isSelected={selectedTemplateIds.includes(template.templateId)}
          onToggleTemplate={onToggleTemplate}
          onToggleFavorite={onToggleFavorite}
          onEditTemplate={onEditTemplate}
        />
      ))}
    </div>
  );
}
