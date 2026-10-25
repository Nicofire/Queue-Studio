import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from './IconButton';
import { Modal } from './Modal';

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
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  if (!isOpen) {
    return null;
  }

  const handleSave = async () => {
    if (!name.trim()) {
      return;
    }
    await onSave(name);
  };
  const requestClose = () => {
    if (isSaving) return;
    if (name.trim()) setConfirmDiscard(true);
    else onClose();
  };

  return (
    <Modal titleId="add-category-title" onRequestClose={requestClose}>
      <header className="modal-header">
        <h3 id="add-category-title">Add New Category</h3>
        <IconButton
          type="button"
          className="modal-close-button"
          label="Close add category window"
          onClick={requestClose}
          disabled={isSaving}
          title="Close add category window"
        >
          <X size={17} />
        </IconButton>
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
            disabled={isSaving}
          />
        </label>

        {errorMessage ? <p className="field-hint is-error">{errorMessage}</p> : null}
      </div>

      <footer className="modal-footer">
        {confirmDiscard ? (
          <>
            <span>Discard this category?</span>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setConfirmDiscard(false)}
            >
              Keep editing
            </button>
            <button type="button" className="danger-button" onClick={onClose}>
              Discard
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="secondary-button"
              onClick={requestClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleSave}
              disabled={isSaving || !name.trim()}
            >
              <Plus size={16} />
              {isSaving ? 'Creating...' : 'Create category'}
            </button>
          </>
        )}
      </footer>
    </Modal>
  );
}
