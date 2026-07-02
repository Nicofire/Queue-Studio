import { useState } from 'react';

import type {
  CategoryDefinition,
  CategoryTemplateEntry,
} from '../features/categories/categoryTypes';

type CategoryTileTabProps = {
  category: CategoryDefinition;
  selectedTemplateIds: string[];
  onToggleTemplate: (categoryId: string, templateId: string) => void;
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
}: {
  category: CategoryDefinition;
  template: CategoryTemplateEntry;
  isSelected: boolean;
  onToggleTemplate: (categoryId: string, templateId: string) => void;
}) {
  const [imageVisible, setImageVisible] = useState(Boolean(template.data.image_path));
  const imageSrc = mapImagePath(template.data.image_path);

  return (
    <article className={isSelected ? 'category-tile is-selected' : 'category-tile'}>
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
          <label className="template-tile-checkbox">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleTemplate(category.id, template.templateId)}
            />
            Select
          </label>
        </div>

        <p className="field-hint">{template.data.positive_prompt || 'No positive prompt'}</p>
      </div>
    </article>
  );
}

export function CategoryTileTab({
  category,
  selectedTemplateIds,
  onToggleTemplate,
}: CategoryTileTabProps) {
  return (
    <div className="category-tile-grid">
      {category.templates.map((template) => (
        <CategoryTile
          key={template.templateId}
          category={category}
          template={template}
          isSelected={selectedTemplateIds.includes(template.templateId)}
          onToggleTemplate={onToggleTemplate}
        />
      ))}
    </div>
  );
}
