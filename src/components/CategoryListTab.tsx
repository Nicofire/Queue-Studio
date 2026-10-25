import { ImageOff, Pencil, Star } from 'lucide-react';
import type { CategoryDefinition } from '../features/categories/categoryTypes';
import { IconButton } from './IconButton';

type CategoryListTabProps = {
  category: CategoryDefinition;
  selectedTemplateIds: string[];
  onToggleTemplate: (categoryId: string, templateId: string) => void;
  onToggleFavorite: (categoryId: string, templateId: string, favorite: boolean) => void;
  onEditTemplate: (categoryId: string, templateId: string) => void;
  favoriteOnly?: boolean;
  searchQuery?: string;
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

export function CategoryListTab({
  category,
  selectedTemplateIds,
  onToggleTemplate,
  onToggleFavorite,
  onEditTemplate,
  favoriteOnly = false,
  searchQuery = '',
}: CategoryListTabProps) {
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredTemplates = category.templates.filter((template) => {
    if (normalizedSearch && !template.title.toLowerCase().includes(normalizedSearch)) {
      return false;
    }

    if (favoriteOnly && !template.data.favorite) {
      return false;
    }

    return true;
  });

  return (
    <div className="category-list-view" role="list" aria-label={`${category.title} templates`}>
      {filteredTemplates.map((template) => {
        const isChecked = selectedTemplateIds.includes(template.templateId);
        const imageSrc = mapImagePath(template.data.image_path);

        return (
          <div
            className={isChecked ? 'category-list-row is-selected' : 'category-list-row'}
            role="listitem"
            key={template.templateId}
          >
            <label className="row-selection">
              <input
                className="template-checkbox"
                type="checkbox"
                checked={isChecked}
                onChange={() => onToggleTemplate(category.id, template.templateId)}
              />
              <span className="row-thumbnail" aria-hidden="true">
                {imageSrc ? (
                  <img
                    src={imageSrc}
                    alt=""
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.hidden = true;
                    }}
                  />
                ) : (
                  <ImageOff size={15} />
                )}
              </span>
              <span className="template-row-title">{template.title}</span>
            </label>
            <IconButton
              type="button"
              className={
                template.data.favorite
                  ? 'favorite-toggle-button is-active'
                  : 'favorite-toggle-button'
              }
              label={
                template.data.favorite
                  ? `Remove ${template.title} from favorites`
                  : `Mark ${template.title} as favorite`
              }
              title={template.data.favorite ? 'Favorite entry' : 'Mark as favorite'}
              aria-pressed={template.data.favorite}
              onClick={(event) => {
                event.preventDefault();
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
                event.preventDefault();
                event.stopPropagation();
                onEditTemplate(category.id, template.templateId);
              }}
            >
              <Pencil size={15} />
            </IconButton>

            <span className="template-hover-tooltip" role="tooltip" aria-hidden="true">
              {imageSrc ? (
                <img
                  className="template-hover-tooltip-image"
                  src={imageSrc}
                  alt={`${template.title} preview`}
                  loading="lazy"
                />
              ) : (
                <span className="template-hover-tooltip-image placeholder">No preview image</span>
              )}

              <span className="template-hover-tooltip-text">
                <strong>{template.title}</strong>
                <span>LoRA: {template.data.loras || '-'}</span>
                <span>Positive: {template.data.positive_prompt || '-'}</span>
                <span>Negative: {template.data.negative_prompt || '-'}</span>
              </span>
            </span>
          </div>
        );
      })}

      {filteredTemplates.length === 0 ? (
        <p className="category-empty-state">No matching entries in this category.</p>
      ) : null}
    </div>
  );
}
