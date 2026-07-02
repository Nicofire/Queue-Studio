import { useState } from 'react';

type AddCategoryModalProps = {
  isOpen: boolean;
  errorMessage: string | null;
  isSaving: boolean;
  onClose: () => void;
  onSave: (name: string) => Promise<void> | void;
};

export function AddCategoryModal({
  isOpen,
  errorMessage,
  isSaving,
  onClose,
  onSave,
}: AddCategoryModalProps) {
  const [name, setName] = useState('');

  if (!isOpen) {
    return null;
  }

  const handleSave = async () => {
    if (!name.trim()) {
      return;
    }
    await onSave(name);
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-category-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h3 id="add-category-title">Add New Category</h3>
          <button
            type="button"
            className="modal-close-button"
            aria-label="Close add category window"
            onClick={onClose}
          >
            X
          </button>
        </header>

        <div className="modal-body">
          <label className="field-group" htmlFor="category-name-input">
            <span className="field-label">Category Name</span>
            <input
              id="category-name-input"
              className="text-input"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="example: vehicles"
              autoFocus
            />
          </label>

          {errorMessage ? <p className="field-hint is-error">{errorMessage}</p> : null}
        </div>

        <footer className="modal-footer">
          <button type="button" className="secondary-button" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </footer>
      </section>
    </div>
  );
}
