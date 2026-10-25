import { Check, ImageOff, Pencil, Star } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from './IconButton';

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
    <article className={isSelected ? 'category-tile is-selected' : 'category-tile'}>
      <button
        type="button"
        className="tile-select-area"
        aria-pressed={isSelected}
        aria-label={`${isSelected ? 'Deselect' : 'Select'} ${template.title}`}
        onClick={toggleSelection}
      >
        {isSelected ? (
          <span className="category-tile-selected-badge" aria-hidden="true">
            <Check size={16} />
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
          <span className="category-tile-image placeholder" aria-hidden="true">
            <ImageOff size={24} strokeWidth={1.25} />
            No preview
          </span>
        )}
        <span className="tile-select-title">{template.title}</span>
        <span className="field-hint category-tile-prompt">
          {template.data.positive_prompt || 'No positive prompt'}
        </span>
      </button>
      <div className="category-tile-footer">
        <span className="tile-model-label" title={template.data.model || 'Default model'}>
          {template.data.model || 'Default model'}
        </span>
        <span className="category-tile-actions">
          <IconButton
            type="button"
            className={
              template.data.favorite ? 'favorite-toggle-button is-active' : 'favorite-toggle-button'
            }
            label={
              template.data.favorite
                ? `Remove ${template.title} from favorites`
                : `Mark ${template.title} as favorite`
            }
            title={template.data.favorite ? 'Favorite entry' : 'Mark as favorite'}
            aria-pressed={template.data.favorite}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite(category.id, template.templateId, !template.data.favorite);
            }}
          >
            <Star size={16} fill={template.data.favorite ? 'currentColor' : 'none'} />
          </IconButton>

          <IconButton
            type="button"
            className="entry-edit-button"
            label={`Edit ${template.title}`}
            title={`Edit ${template.title}`}
            onClick={(event) => {
              event.stopPropagation();
              onEditTemplate(category.id, template.templateId);
            }}
          >
            <Pencil size={15} />
          </IconButton>
        </span>
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
          key={`${template.templateId}:${template.data.image_path}`}
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
