import { useEffect, useRef, useState } from 'react';

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
import { generatePreviewImage } from '../features/generation/generationApi';
import { fetchModelsViaProxy } from '../pages/SettingsPageComponents/settingsApi';

type CategoryEntryModalProps = {
  mode: 'create' | 'edit';
  categoryTitle: string;
  entry: CategoryTemplateEntry | null;
  automaticApiUrl: string;
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
  automaticApiUrl,
  errorMessage,
  isSaving,
  isDeleting,
  onClose,
  onSave,
  onDelete,
}: CategoryEntryModalProps) {
  const [entryName, setEntryName] = useState(entry?.title ?? '');
  const [positivePrompt, setPositivePrompt] = useState(entry?.data.positive_prompt ?? '');
  const [negativePrompt, setNegativePrompt] = useState(entry?.data.negative_prompt ?? '');
  const [loras, setLoras] = useState(entry?.data.loras ?? '');
  const [model, setModel] = useState(entry?.data.model ?? '');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState('');
  const [generatedImageBase64, setGeneratedImageBase64] = useState('');
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [modelListFailed, setModelListFailed] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef('');

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
        const models = await fetchModelsViaProxy(automaticApiUrl, controller.signal);
        const names = models
          .map((item) => item.title ?? item.model_name ?? '')
          .filter((name) => name.length > 0);
        setModelOptions(names);
        setModelListFailed(names.length === 0);
      } catch {
        if (!controller.signal.aborted) {
          setModelListFailed(true);
        }
      }
    })();

    return () => controller.abort();
  }, [automaticApiUrl]);

  const previewSrc = generatedImageBase64
    ? `data:image/png;base64,${generatedImageBase64}`
    : selectedImagePreview || (removeExistingImage ? '' : existingImageSrc);

  const hasImage = Boolean(previewSrc);

  const handleImageSelection = async (file: File) => {
    setDropError(null);
    setGeneratedImageBase64('');
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
    if (!positivePrompt.trim() && !loras.trim()) {
      setGenerateError('Add a positive prompt or LoRA before generating a preview.');
      return;
    }

    setGenerateError(null);
    setIsGenerating(true);

    try {
      const result = await generatePreviewImage({
        positive_prompt: positivePrompt.trim(),
        negative_prompt: negativePrompt.trim(),
        loras: loras.trim(),
        model: model.trim() || undefined,
      });

      setGeneratedImageBase64(result.imageBase64);
      setImageFile(null);
      setRemoveExistingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      setGenerateError(
        error instanceof Error ? error.message : 'Could not generate a preview image.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRemoveImage = () => {
    setGeneratedImageBase64('');
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

    if (generatedImageBase64) {
      imageDataBase64 = generatedImageBase64;
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
  // Keep a stored model selectable even when Automatic1111 no longer reports it.
  const modelSelectOptions =
    model && !modelOptions.includes(model) ? [model, ...modelOptions] : modelOptions;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card entry-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="entry-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h3 id="entry-modal-title">
            {mode === 'edit' ? `Edit ${entry?.title ?? 'entry'}` : `Add Entry to ${categoryTitle}`}
          </h3>
          <button
            type="button"
            className="modal-close-button"
            aria-label="Close entry window"
            onClick={onClose}
          >
            X
          </button>
        </header>

        <div className="modal-body">
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

          <div
            className="entry-drop-zone"
            onDrop={(event) => void handleDrop(event)}
            onDragOver={(event) => event.preventDefault()}
          >
            <p className="field-label">Preview image</p>
            <p className="field-hint">
              Drop an image or pick a file. PNG metadata with key parameters is read and prompts are
              merged.
            </p>

            {hasImage ? (
              <img className="entry-image-preview" src={previewSrc} alt="Entry preview" />
            ) : null}

            <input
              ref={fileInputRef}
              className="entry-file-input"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/bmp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleImageSelection(file);
                }
              }}
            />

            <div className="entry-image-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => void handleGenerate()}
                disabled={isBusy}
                title="Generate a preview image from the fields above"
              >
                {isGenerating ? 'Generating...' : 'Generate'}
              </button>
              {hasImage ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleRemoveImage}
                  disabled={isBusy}
                >
                  Remove image
                </button>
              ) : null}
            </div>

            <p className="field-hint">
              {generatedImageBase64
                ? 'Generated preview will be saved with this entry.'
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
          {errorMessage ? <p className="field-hint is-error">{errorMessage}</p> : null}
        </div>

        <footer className="modal-footer">
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
                Delete entry
              </button>
            )
          ) : null}

          <button type="button" className="secondary-button" onClick={onClose} disabled={isBusy}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleSave()}
            disabled={isBusy || !entryName.trim()}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </footer>
      </section>
    </div>
  );
}
