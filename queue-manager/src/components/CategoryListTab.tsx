import type {
  CategoryDefinition,
  CategoryTemplateEntry,
} from '../features/categories/categoryTypes';

type CategoryListTabProps = {
  category: CategoryDefinition;
  selectedTemplateIds: string[];
  onToggleTemplate: (categoryId: string, templateId: string) => void;
};

const summarizeTemplate = (template: CategoryTemplateEntry) => {
  const summaryParts = [
    template.data.loras,
    template.data.positive_prompt,
    template.data.negative_prompt ? `neg: ${template.data.negative_prompt}` : '',
  ].filter(Boolean);

  return summaryParts.join(' | ') || 'No prompt data';
};

export function CategoryListTab({
  category,
  selectedTemplateIds,
  onToggleTemplate,
}: CategoryListTabProps) {
  return (
    <div className="category-list-view" role="table" aria-label={`${category.title} templates`}>
      {category.templates.map((template) => {
        const isChecked = selectedTemplateIds.includes(template.templateId);

        return (
          <label className="category-list-row" key={template.templateId}>
            <input
              className="template-checkbox"
              type="checkbox"
              checked={isChecked}
              onChange={() => onToggleTemplate(category.id, template.templateId)}
            />
            <span className="template-row-title">{template.title}</span>
            <span className="template-row-details">{summarizeTemplate(template)}</span>
          </label>
        );
      })}
    </div>
  );
}
