import type {
  CategoryDefinition,
  CategorySelectionMap,
} from '../features/categories/categoryTypes';

type CategoryQueueSummaryProps = {
  categories: CategoryDefinition[];
  selectionByCategory: CategorySelectionMap;
  errorMessages?: Array<string | null>;
};

export function CategoryQueueSummary({
  categories,
  errorMessages = [],
}: CategoryQueueSummaryProps) {
  return (
    <section className="queue-summary">
      <p className="field-hint">
        Category order: {categories.map((category) => category.title).join(' / ')}
      </p>
      {errorMessages.filter(Boolean).map((message) => (
        <p className="field-hint is-error" key={message}>
          {message}
        </p>
      ))}
    </section>
  );
}
