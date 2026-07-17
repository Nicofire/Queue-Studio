import type {
  CategoryDefinition,
  CategorySelectionMap,
} from '../features/categories/categoryTypes';
import { getQueueCombinationCount } from '../features/categories/queueBuilder';

type CategoryQueueSummaryProps = {
  categories: CategoryDefinition[];
  selectionByCategory: CategorySelectionMap;
  errorMessages?: Array<string | null>;
};

export function CategoryQueueSummary({
  categories,
  selectionByCategory,
  errorMessages = [],
}: CategoryQueueSummaryProps) {
  const queueCount = getQueueCombinationCount(categories, selectionByCategory);

  return (
    <section className="queue-summary">
      <p className="field-hint">
        Queue build order: {categories.map((category) => category.title).join(' -> ')}
      </p>
      <p className="field-hint">
        Generated queue combinations with current selections: {queueCount}
      </p>
      {errorMessages.filter(Boolean).map((message) => (
        <p className="field-hint is-error" key={message}>
          {message}
        </p>
      ))}
    </section>
  );
}
