import { Check, ImagePlus, LoaderCircle, Save, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { IconButton } from './IconButton';
import { Modal } from './Modal';

import type {
  CategoryEntryFormPayload,
  CategoryTemplateEntry,
} from '../features/categories/categoryTypes';
import {
  extractPngTextValue,
  mergePrompts,
  parseA1111Parameters,
  readFileAsDataUrl,
} from '../features/categories/imageMetadata';
import type { WorkflowPreset } from '../features/generation/comfyWorkflow';
import { generatePreviewImage } from '../features/generation/generationApi';
import {
  getActiveConnection,
  toPersistedGenerationSettings,
  type GenerationSettings,
} from '../features/settings/generationSettings';
import {
  fetchGenerationModels,
  requestGenerationJson,
} from '../pages/SettingsPageComponents/settingsApi';

type CategoryEntryModalProps = {
  mode: 'create' | 'edit';
  categoryTitle: string;
  entry: CategoryTemplateEntry | null;
  generationSettings: GenerationSettings;
  generationBusy: boolean;
  errorMessage: string | null;
  isSaving: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onSave: (payload: CategoryEntryFormPayload) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
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

export function CategoryEntryModal({
  mode,
  categoryTitle,
  entry,
  generationSettings,
  generationBusy,
  errorMessage,
  isSaving,
  isDeleting,
  onClose,
  onSave,
  onDelete,
}: CategoryEntryModalProps) {
  const connection = getActiveConnection(generationSettings);
  const [entryName, setEntryName] = useState(entry?.title ?? '');
  const [positivePrompt, setPositivePrompt] = useState(entry?.data.positive_prompt ?? '');
  const [negativePrompt, setNegativePrompt] = useState(entry?.data.negative_prompt ?? '');
  const [loras, setLoras] = useState(entry?.data.loras ?? '');
  const [model, setModel] = useState(entry?.data.model ?? '');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState('');
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [selectedGeneratedIndex, setSelectedGeneratedIndex] = useState<number | null>(null);
  const [batchSize, setBatchSize] = useState<1 | 4 | 9>(4);
  const [workflow, setWorkflow] = useState<WorkflowPreset | null>(null);
  const canBatch =
    connection.provider !== 'comfyui' ||
    connection.workflowId === 'builtin-txt2img' ||
    Boolean(workflow?.bindings.batchSize?.length);
  const previewBatchSize = canBatch ? batchSize : 1;
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [modelListFailed, setModelListFailed] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef('');
  const previewControllerRef = useRef<AbortController | null>(null);

  const existingImageSrc = mapImagePath(entry?.data.image_path ?? '');

  const setImageFile = (file: File | null) => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = '';
    }

    if (file) {
      objectUrlRef.current = URL.createObjectURL(file);
    }

    setSelectedImage(file);
    setSelectedImagePreview(objectUrlRef.current);
  };

  useEffect(
    () => () => {
      previewControllerRef.current?.abort();
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const models = await fetchGenerationModels(
          connection.provider,
          connection.apiUrl,
          controller.signal,
          connection.workflowId
        );
        if (controller.signal.aborted) return;
        const names = models.map((item) => item.id);
        setModelOptions(names);
        setModelListFailed(names.length === 0);
      } catch {
        if (!controller.signal.aborted) {
          setModelListFailed(true);
        }
      }
    })();

    return () => controller.abort();
  }, [connection.provider, connection.apiUrl, connection.workflowId]);

  useEffect(() => {
    if (connection.provider !== 'comfyui') return;
    const controller = new AbortController();
    void requestGenerationJson<WorkflowPreset>(
      `/api/generation/workflows/${encodeURIComponent(connection.workflowId)}`,
      { signal: controller.signal }
    )
      .then((value) => {
        if (!controller.signal.aborted) setWorkflow(value);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [connection.provider, connection.workflowId]);

  const hasGeneratedGrid = generatedImages.length > 0;
  const selectedGeneratedImage =
    selectedGeneratedIndex !== null ? generatedImages[selectedGeneratedIndex] : undefined;
  const previewSrc = selectedGeneratedImage
    ? `data:image/png;base64,${selectedGeneratedImage}`
    : selectedImagePreview || (removeExistingImage ? '' : existingImageSrc);

  const hasImage = hasGeneratedGrid || Boolean(previewSrc);

  const handleImageSelection = async (file: File) => {
    setDropError(null);
    setGeneratedImages([]);
    setSelectedGeneratedIndex(null);
    setRemoveExistingImage(false);
    setImageFile(file);

    if (!file.name.toLowerCase().endsWith('.png')) {
      return;
    }

    try {
      const parameterText = await extractPngTextValue(file, 'parameters');
      if (!parameterText) {
        return;
      }

      const parsed = parseA1111Parameters(parameterText);
      if (parsed.positive) {
        setPositivePrompt((current) => mergePrompts(current, parsed.positive));
      }
      if (parsed.negative) {
        setNegativePrompt((current) => mergePrompts(current, parsed.negative));
      }
    } catch {
      setDropError('Could not extract metadata from the dropped image.');
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setDropError('Please drop an image file.');
      return;
    }

    await handleImageSelection(file);
  };

  const handleGenerate = async () => {
    if (generationBusy) {
      setGenerateError('Another generation operation is active.');
      return;
    }
    if (!positivePrompt.trim() && !loras.trim()) {
      setGenerateError('Add a positive prompt or LoRA before generating a preview.');
      return;
    }

    setGenerateError(null);
    setIsGenerating(true);
    const controller = new AbortController();
    previewControllerRef.current = controller;

    try {
      const result = await generatePreviewImage(
        {
          expectedConnection: toPersistedGenerationSettings(generationSettings).connection,
          positive_prompt: positivePrompt.trim(),
          negative_prompt: negativePrompt.trim(),
          loras: loras.trim(),
          model: model.trim() || undefined,
          batchSize: previewBatchSize,
        },
        controller.signal
      );

      setGeneratedImages(result.images);
      setSelectedGeneratedIndex(result.images.length > 0 ? 0 : null);
      setImageFile(null);
      setRemoveExistingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      setGenerateError(
        controller.signal.aborted
          ? 'Preview cancelled.'
          : error instanceof Error
            ? error.message
            : 'Could not generate a preview image.'
      );
    } finally {
      if (previewControllerRef.current === controller) previewControllerRef.current = null;
      setIsGenerating(false);
    }
  };

  const handleRemoveImage = () => {
    setGeneratedImages([]);
    setSelectedGeneratedIndex(null);
    setImageFile(null);
    setRemoveExistingImage(true);
    setDropError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    const trimmedEntryName = entryName.trim();
    if (!trimmedEntryName) {
      return;
    }

    let imageDataBase64: string | undefined;
    let imageOriginalName: string | undefined;

    if (selectedGeneratedImage) {
      imageDataBase64 = selectedGeneratedImage;
      imageOriginalName = `${trimmedEntryName}.png`;
    } else if (selectedImage) {
      const dataUrl = await readFileAsDataUrl(selectedImage);
      imageDataBase64 = dataUrl.split(',')[1] || undefined;
      imageOriginalName = selectedImage.name;
    }

    await onSave({
      entryName: trimmedEntryName,
      positive_prompt: positivePrompt.trim(),
      negative_prompt: negativePrompt.trim(),
      loras: loras.trim(),
      model: model.trim() || undefined,
      imageDataBase64,
      imageOriginalName,
      removeImage: removeExistingImage && !imageDataBase64,
    });
  };

  const isBusy = isSaving || isDeleting || isGenerating;
  const isDirty =
    entryName !== (entry?.title ?? '') ||
    positivePrompt !== (entry?.data.positive_prompt ?? '') ||
    negativePrompt !== (entry?.data.negative_prompt ?? '') ||
    loras !== (entry?.data.loras ?? '') ||
    model !== (entry?.data.model ?? '') ||
    Boolean(selectedImage) ||
    generatedImages.length > 0 ||
    removeExistingImage;
  const requestClose = () => {
    if (isBusy) return;
    if (isDirty) setIsConfirmingDiscard(true);
    else onClose();
  };
  // Keep a stored model selectable even when Automatic1111 no longer reports it.
  const modelSelectOptions =
    model && !modelOptions.includes(model) ? [model, ...modelOptions] : modelOptions;

  return (
    <Modal className="entry-modal" titleId="entry-modal-title" onRequestClose={requestClose}>
      <header className="modal-header">
        <h3 id="entry-modal-title">
          {mode === 'edit' ? `Edit ${entry?.title ?? 'entry'}` : `Add Entry to ${categoryTitle}`}
        </h3>
        <IconButton
          type="button"
          className="modal-close-button"
          label="Close entry window"
          onClick={requestClose}
          disabled={isBusy}
          title="Close entry window"
        >
          <X size={17} />
        </IconButton>
      </header>

      <div className="modal-body entry-editor-layout">
        <fieldset className="entry-fields" disabled={isBusy}>
          <label className="field-group" htmlFor="entry-name-input">
            <span className="field-label">Entry Name</span>
            <input
              id="entry-name-input"
              className="text-input"
              type="text"
              value={entryName}
              onChange={(event) => setEntryName(event.target.value)}
              placeholder="example: cyberpunk city"
              autoFocus
            />
          </label>

          <label className="field-group" htmlFor="entry-positive-input">
            <span className="field-label">Positive Prompt</span>
            <textarea
              id="entry-positive-input"
              className="text-area entry-text-area"
              value={positivePrompt}
              onChange={(event) => setPositivePrompt(event.target.value)}
            />
          </label>

          <label className="field-group" htmlFor="entry-negative-input">
            <span className="field-label">Negative Prompt</span>
            <textarea
              id="entry-negative-input"
              className="text-area entry-text-area"
              value={negativePrompt}
              onChange={(event) => setNegativePrompt(event.target.value)}
            />
          </label>

          <label className="field-group" htmlFor="entry-loras-input">
            <span className="field-label">LoRAs</span>
            <input
              id="entry-loras-input"
              className="text-input"
              type="text"
              value={loras}
              onChange={(event) => setLoras(event.target.value)}
              placeholder="<lora:example:1>"
            />
          </label>

          <label className="field-group" htmlFor="entry-model-input">
            <span className="field-label">Model (optional)</span>
            {modelListFailed ? (
              <input
                id="entry-model-input"
                className="text-input"
                type="text"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="exampleModel.safetensors"
              />
            ) : (
              <select
                id="entry-model-input"
                className="text-input"
                value={model}
                onChange={(event) => setModel(event.target.value)}
              >
                <option value="">Use the model from settings</option>
                {modelSelectOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
            <span className="field-hint">
              {modelListFailed
                ? 'Model list unavailable, enter the checkpoint name manually.'
                : 'Overrides the global model for this entry only.'}
            </span>
          </label>

          {errorMessage ? (
            <p className="field-hint is-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </fieldset>
        <div className="entry-media">
          <div
            className="entry-drop-zone"
            onDrop={(event) => void handleDrop(event)}
            onDragOver={(event) => event.preventDefault()}
          >
            <p className="field-label">Preview image</p>
            {hasGeneratedGrid ? (
              <div
                className={`entry-generated-grid entry-generated-grid-${generatedImages.length === 1 ? 1 : generatedImages.length > 4 ? 9 : 4}`}
                role="group"
                aria-label="Generated preview images"
              >
                {generatedImages.map((image, index) => {
                  const isSelected = index === selectedGeneratedIndex;
                  return (
                    <button
                      key={index}
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={`Select preview ${index + 1}`}
                      className={
                        isSelected ? 'entry-generated-tile is-selected' : 'entry-generated-tile'
                      }
                      onClick={() => setSelectedGeneratedIndex(index)}
                      disabled={isBusy}
                    >
                      {isSelected ? (
                        <span className="category-tile-selected-badge" aria-hidden="true">
                          <Check size={15} />
                        </span>
                      ) : null}
                      <img
                        className="entry-generated-image"
                        src={`data:image/png;base64,${image}`}
                        alt={`Generated option ${index + 1}`}
                      />
                    </button>
                  );
                })}
              </div>
            ) : hasImage ? (
              <img className="entry-image-preview" src={previewSrc} alt="Entry preview" />
            ) : (
              <div className="entry-image-empty">
                <ImagePlus size={32} strokeWidth={1.25} />
                <span>No preview image</span>
              </div>
            )}

            <label className="field-group">
              <span className="field-label">Upload image</span>
              <input
                ref={fileInputRef}
                className="entry-file-input"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/bmp"
                disabled={isBusy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleImageSelection(file);
                  }
                }}
              />
            </label>

            <div className="entry-image-actions">
              <div className="entry-batch-size-toggle" role="group" aria-label="Batch size">
                <button
                  type="button"
                  className={
                    previewBatchSize === 1 ? 'secondary-button is-active' : 'secondary-button'
                  }
                  onClick={() => setBatchSize(1)}
                  disabled={isBusy}
                  aria-pressed={previewBatchSize === 1}
                >
                  1
                </button>
                <button
                  type="button"
                  className={
                    previewBatchSize === 4 ? 'secondary-button is-active' : 'secondary-button'
                  }
                  onClick={() => setBatchSize(4)}
                  disabled={isBusy || !canBatch}
                  aria-pressed={previewBatchSize === 4}
                >
                  2x2
                </button>
                <button
                  type="button"
                  className={
                    previewBatchSize === 9 ? 'secondary-button is-active' : 'secondary-button'
                  }
                  onClick={() => setBatchSize(9)}
                  disabled={isBusy || !canBatch}
                  aria-pressed={previewBatchSize === 9}
                >
                  3x3
                </button>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void handleGenerate()}
                disabled={isBusy || generationBusy}
                title="Generate a batch of preview images from the fields above"
              >
                {isGenerating ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                {isGenerating ? 'Generating...' : `Generate ${previewBatchSize}`}
              </button>
              {isGenerating ? (
                <IconButton
                  label="Cancel generation"
                  onClick={() => previewControllerRef.current?.abort()}
                >
                  <X size={16} />
                </IconButton>
              ) : null}
              {hasImage ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleRemoveImage}
                  disabled={isBusy}
                >
                  <Trash2 size={15} /> Remove
                </button>
              ) : null}
            </div>

            <p className="field-hint">
              {hasGeneratedGrid
                ? `Preview ${(selectedGeneratedIndex ?? 0) + 1} selected`
                : selectedImage
                  ? `Selected image: ${selectedImage.name}`
                  : removeExistingImage
                    ? 'Image will be removed on save.'
                    : existingImageSrc
                      ? 'Current image kept.'
                      : 'No image selected'}
            </p>
          </div>

          {generateError ? <p className="field-hint is-error">{generateError}</p> : null}
          {dropError ? <p className="field-hint is-error">{dropError}</p> : null}
        </div>
      </div>

      <footer className="modal-footer">
        {isConfirmingDiscard ? (
          <div className="entry-discard-confirm" role="alert">
            <strong>Discard unsaved changes?</strong>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setIsConfirmingDiscard(false)}
            >
              Keep editing
            </button>
            <button type="button" className="danger-button" onClick={onClose}>
              Discard changes
            </button>
          </div>
        ) : (
          <>
            {mode === 'edit' ? (
              isConfirmingDelete ? (
                <div className="entry-delete-confirm">
                  <span className="field-hint is-error">Delete this entry permanently?</span>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => void onDelete()}
                    disabled={isBusy}
                  >
                    {isDeleting ? 'Deleting...' : 'Confirm delete'}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setIsConfirmingDelete(false)}
                    disabled={isBusy}
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="danger-button entry-delete-button"
                  onClick={() => setIsConfirmingDelete(true)}
                  disabled={isBusy}
                >
                  <Trash2 size={15} /> Delete entry
                </button>
              )
            ) : null}

            <button
              type="button"
              className="secondary-button"
              onClick={requestClose}
              disabled={isBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => void handleSave()}
              disabled={isBusy || !entryName.trim()}
            >
              <Save size={16} />
              {isSaving ? 'Saving...' : 'Save entry'}
            </button>
          </>
        )}
      </footer>
    </Modal>
  );
}
