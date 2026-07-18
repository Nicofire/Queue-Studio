import type { CategoryDefinition } from '../features/categories/categoryTypes';

type CategoryListTabProps = {
  category: CategoryDefinition;
  selectedTemplateIds: string[];
  onToggleTemplate: (categoryId: string, templateId: string) => void;
  onToggleFavorite: (categoryId: string, templateId: string, favorite: boolean) => void;
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
    <div className="category-list-view" role="table" aria-label={`${category.title} templates`}>
      {filteredTemplates.map((template) => {
        const isChecked = selectedTemplateIds.includes(template.templateId);
        const imageSrc = mapImagePath(template.data.image_path);

        return (
          <label className="category-list-row" key={template.templateId}>
            <input
              className="template-checkbox"
              type="checkbox"
              checked={isChecked}
              onChange={() => onToggleTemplate(category.id, template.templateId)}
            />
            <span className="template-row-title">{template.title}</span>
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
                event.preventDefault();
                event.stopPropagation();
                onToggleFavorite(category.id, template.templateId, !template.data.favorite);
              }}
            >
              {template.data.favorite ? '★' : '☆'}
            </button>

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
          </label>
        );
      })}

      {filteredTemplates.length === 0 ? (
        <p className="category-empty-state">No matching entries in this category.</p>
      ) : null}
    </div>
  );
}
