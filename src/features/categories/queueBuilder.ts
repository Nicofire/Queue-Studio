import type { CategoryDefinition, CategorySelectionMap } from './categoryTypes';

export type QueueCombination = Record<string, string>;

export const buildQueueCombinations = (
  categories: CategoryDefinition[],
  selectionByCategory: CategorySelectionMap
): QueueCombination[] => {
  let combinations: QueueCombination[] = [{}];

  for (const category of categories) {
    const selectedTemplateIds = selectionByCategory[category.id];
    const categoryValues =
      selectedTemplateIds && selectedTemplateIds.length > 0 ? selectedTemplateIds : [''];

    combinations = combinations.flatMap((combination) =>
      categoryValues.map((templateId) => ({
        ...combination,
        [category.id]: templateId,
      }))
    );
  }

  return combinations;
};

export const getQueueCombinationCount = (
  categories: CategoryDefinition[],
  selectionByCategory: CategorySelectionMap
) =>
  categories.reduce((accumulator, category) => {
    const selectedCount = selectionByCategory[category.id]?.length ?? 0;
    return accumulator * Math.max(1, selectedCount);
  }, 1);
