import { useState } from 'react';

import {
  extractPngTextValue,
  mergePrompts,
  parseA1111Parameters,
  readFileAsDataUrl,
} from '../features/categories/imageMetadata';

type AddCategoryEntryModalProps = {
  isOpen: boolean;
  categoryTitle: string;
  errorMessage: string | null;
  isSaving: boolean;
  onClose: () => void;
  onSave: (payload: {
    entryName: string;
    positive_prompt: string;
    negative_prompt: string;
    loras: string;
    model?: string;
    imageDataBase64?: string;
    imageOriginalName?: string;
  }) => Promise<void> | void;
};

export function AddCategoryEntryModal({
  isOpen,
  categoryTitle,
  errorMessage,
  isSaving,
  onClose,
  onSave,
}: AddCategoryEntryModalProps) {
  const [entryName, setEntryName] = useState('');
  const [positivePrompt, setPositivePrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [loras, setLoras] = useState('');
  const [model, setModel] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  const handleImageSelection = async (file: File) => {
    setDropError(null);
    setSelectedImage(file);

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

  const handleSave = async () => {
    const trimmedEntryName = entryName.trim();
    if (!trimmedEntryName) {
      return;
    }

    let imageDataBase64: string | undefined;
    let imageOriginalName: string | undefined;

    if (selectedImage) {
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
    });
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card entry-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-entry-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h3 id="add-entry-title">Add Entry to {categoryTitle}</h3>
          <button
            type="button"
            className="modal-close-button"
            aria-label="Close add entry window"
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
            <input
              id="entry-model-input"
              className="text-input"
              type="text"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="exampleModel.safetensors"
            />
          </label>

          <div
            className="entry-drop-zone"
            onDrop={(event) => void handleDrop(event)}
            onDragOver={(event) => event.preventDefault()}
          >
            <p className="field-label">Image (drag and drop)</p>
            <p className="field-hint">
              Drop image to upload it. PNG metadata with key parameters is read and prompts are
              merged.
            </p>
            <input
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
            <p className="field-hint">
              {selectedImage ? `Selected image: ${selectedImage.name}` : 'No image selected'}
            </p>
          </div>

          {dropError ? <p className="field-hint is-error">{dropError}</p> : null}
          {errorMessage ? <p className="field-hint is-error">{errorMessage}</p> : null}
        </div>

        <footer className="modal-footer">
          <button type="button" className="secondary-button" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleSave()}
            disabled={isSaving || !entryName.trim()}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </footer>
      </section>
    </div>
  );
}
