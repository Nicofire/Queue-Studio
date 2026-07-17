import type {
  CategoryDefinition,
  CategoryTemplateEntry,
} from '../features/categories/categoryTypes';

type CategoryListTabProps = {
  category: CategoryDefinition;
  selectedTemplateIds: string[];
  onToggleTemplate: (categoryId: string, templateId: string) => void;
  searchQuery?: string;
};

const summarizeTemplate = (template: CategoryTemplateEntry) => {
  const summaryParts = [
    `LoRA: ${template.data.loras || '-'}`,
    `Positive: ${template.data.positive_prompt || '-'}`,
    `Negative: ${template.data.negative_prompt || '-'}`,
  ].filter(Boolean);

  return summaryParts.join('\n') || 'No prompt data';
};

export function CategoryListTab({
  category,
  selectedTemplateIds,
  onToggleTemplate,
  searchQuery = '',
}: CategoryListTabProps) {
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredTemplates = normalizedSearch
    ? category.templates.filter((template) =>
        template.title.toLowerCase().includes(normalizedSearch)
      )
    : category.templates;

  return (
    <div className="category-list-view" role="table" aria-label={`${category.title} templates`}>
      {filteredTemplates.map((template) => {
        const isChecked = selectedTemplateIds.includes(template.templateId);
        const tooltipText = summarizeTemplate(template);

        return (
          <label className="category-list-row" key={template.templateId} title={tooltipText}>
            <input
              className="template-checkbox"
              type="checkbox"
              checked={isChecked}
              onChange={() => onToggleTemplate(category.id, template.templateId)}
            />
            <span className="template-row-title">{template.title}</span>
          </label>
        );
      })}

      {filteredTemplates.length === 0 ? (
        <p className="category-empty-state">No matching entries in this category.</p>
      ) : null}
    </div>
  );
}
