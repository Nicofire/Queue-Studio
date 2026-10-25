import { useState, type Dispatch, type SetStateAction } from 'react';

import {
  createCategoryEntryInProject,
  deleteCategoryEntryInProject,
  toggleCategoryEntryFavoriteInProject,
  updateCategoryEntryInProject,
} from './categoryApi';
import type {
  CategoryDefinition,
  CategoryEntryFormPayload,
  CategorySelectionMap,
} from './categoryTypes';

type UseCategoryEntryActionsArgs = {
  categories: CategoryDefinition[];
  setCategories: Dispatch<SetStateAction<CategoryDefinition[]>>;
  setSelectionByCategory: Dispatch<SetStateAction<CategorySelectionMap>>;
};

/** Entry create/edit/delete/favorite behaviour shared by the list and tile views. */
export function useCategoryEntryActions({
  categories,
  setCategories,
  setSelectionByCategory,
}: UseCategoryEntryActionsArgs) {
  const [entryModalCategoryId, setEntryModalCategoryId] = useState<string | null>(null);
  const [entryModalTemplateId, setEntryModalTemplateId] = useState<string | null>(null);
  const [entryModalError, setEntryModalError] = useState<string | null>(null);
  const [isSavingEntry, setIsSavingEntry] = useState(false);
  const [isDeletingEntry, setIsDeletingEntry] = useState(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);

  const entryModalCategory =
    entryModalCategoryId === null
      ? null
      : (categories.find((category) => category.id === entryModalCategoryId) ?? null);

  const entryModalTemplate =
    entryModalTemplateId === null
      ? null
      : (entryModalCategory?.templates.find(
          (template) => template.templateId === entryModalTemplateId
        ) ?? null);

  const openAddEntryModal = (categoryId: string) => {
    setEntryModalError(null);
    setEntryModalTemplateId(null);
    setEntryModalCategoryId(categoryId);
  };

  const openEditEntryModal = (categoryId: string, templateId: string) => {
    setEntryModalError(null);
    setEntryModalTemplateId(templateId);
    setEntryModalCategoryId(categoryId);
  };

  const closeEntryModal = () => {
    setEntryModalCategoryId(null);
    setEntryModalTemplateId(null);
    setEntryModalError(null);
  };

  const createEntry = async (category: CategoryDefinition, payload: CategoryEntryFormPayload) => {
    const duplicated = category.templates.some(
      (template) => template.templateId.toLowerCase() === payload.entryName.trim().toLowerCase()
    );

    if (duplicated) {
      setEntryModalError('An entry with this name already exists in this category.');
      return;
    }

    const created = await createCategoryEntryInProject({
      categoryId: category.id,
      entryName: payload.entryName,
      positive_prompt: payload.positive_prompt,
      negative_prompt: payload.negative_prompt,
      loras: payload.loras,
      model: payload.model,
      imageDataBase64: payload.imageDataBase64,
      imageOriginalName: payload.imageOriginalName,
    });

    setCategories((current) =>
      current.map((item) =>
        item.id === category.id
          ? {
              ...item,
              templates: [...item.templates, created].sort((a, b) =>
                a.title.localeCompare(b.title)
              ),
            }
          : item
      )
    );

    closeEntryModal();
  };

  const updateEntry = async (
    category: CategoryDefinition,
    templateId: string,
    payload: CategoryEntryFormPayload
  ) => {
    const newEntryName = payload.entryName.trim();
    const duplicated = category.templates.some(
      (template) =>
        template.templateId !== templateId &&
        template.templateId.toLowerCase() === newEntryName.toLowerCase()
    );

    if (duplicated) {
      setEntryModalError('An entry with this name already exists in this category.');
      return;
    }

    const updated = await updateCategoryEntryInProject({
      categoryId: category.id,
      entryName: templateId,
      newEntryName,
      positive_prompt: payload.positive_prompt,
      negative_prompt: payload.negative_prompt,
      loras: payload.loras,
      model: payload.model,
      imageDataBase64: payload.imageDataBase64,
      imageOriginalName: payload.imageOriginalName,
      removeImage: payload.removeImage,
    });

    setCategories((current) =>
      current.map((item) =>
        item.id === category.id
          ? {
              ...item,
              templates: item.templates
                .map((template) => (template.templateId === templateId ? updated : template))
                .sort((a, b) => a.title.localeCompare(b.title)),
            }
          : item
      )
    );

    if (updated.templateId !== templateId) {
      setSelectionByCategory((current) => {
        const selected = current[category.id];
        if (!selected?.includes(templateId)) {
          return current;
        }

        return {
          ...current,
          [category.id]: selected.map((id) => (id === templateId ? updated.templateId : id)),
        };
      });
    }

    closeEntryModal();
  };

  const saveEntry = async (payload: CategoryEntryFormPayload) => {
    if (!entryModalCategory) {
      setEntryModalError('Selected category was not found.');
      return;
    }

    setEntryModalError(null);
    setIsSavingEntry(true);

    try {
      if (entryModalTemplateId) {
        await updateEntry(entryModalCategory, entryModalTemplateId, payload);
      } else {
        await createEntry(entryModalCategory, payload);
      }
    } catch (error) {
      setEntryModalError(
        error instanceof Error ? error.message : 'Could not save the category entry.'
      );
    } finally {
      setIsSavingEntry(false);
    }
  };

  const deleteEntry = async () => {
    if (!entryModalCategory || !entryModalTemplateId) {
      return;
    }

    const categoryId = entryModalCategory.id;
    const templateId = entryModalTemplateId;

    setEntryModalError(null);
    setIsDeletingEntry(true);

    try {
      await deleteCategoryEntryInProject(categoryId, templateId);

      setCategories((current) =>
        current.map((item) =>
          item.id === categoryId
            ? {
                ...item,
                templates: item.templates.filter((template) => template.templateId !== templateId),
              }
            : item
        )
      );

      setSelectionByCategory((current) => {
        const selected = current[categoryId];
        if (!selected?.includes(templateId)) {
          return current;
        }

        return {
          ...current,
          [categoryId]: selected.filter((id) => id !== templateId),
        };
      });

      closeEntryModal();
    } catch (error) {
      setEntryModalError(
        error instanceof Error ? error.message : 'Could not delete the category entry.'
      );
    } finally {
      setIsDeletingEntry(false);
    }
  };

  const toggleFavorite = async (categoryId: string, templateId: string, favorite: boolean) => {
    setFavoriteError(null);

    const previous = categories;
    setCategories((current) =>
      current.map((category) =>
        category.id === categoryId
          ? {
              ...category,
              templates: category.templates.map((template) =>
                template.templateId === templateId
                  ? { ...template, data: { ...template.data, favorite } }
                  : template
              ),
            }
          : category
      )
    );

    try {
      await toggleCategoryEntryFavoriteInProject(categoryId, templateId, favorite);
    } catch (error) {
      setCategories(previous);
      setFavoriteError(error instanceof Error ? error.message : 'Could not update favorite state.');
    }
  };

  return {
    entryModalCategory,
    entryModalTemplate,
    entryModalTemplateId,
    entryModalError,
    isSavingEntry,
    isDeletingEntry,
    favoriteError,
    openAddEntryModal,
    openEditEntryModal,
    closeEntryModal,
    saveEntry,
    deleteEntry,
    toggleFavorite,
  };
}
