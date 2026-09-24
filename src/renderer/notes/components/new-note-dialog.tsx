import { useEffect, useRef, useState } from 'react';
import { SearchablePicker } from '../../shared/searchable-picker';
import { canSubmit, folderOptions } from '../domain/new-note-form';
import '../styles/new-note-dialog.css';

export interface NewNoteDialogProps {
  initialTitle: string;
  folders: string[];
  initialFolder: string;
  onSubmit(result: { title: string; folder: string }): void;
  onCancel(): void;
}

function folderLabel(folder: string, options: ReturnType<typeof folderOptions>): string {
  return options.find((option) => option.id === folder)?.label ?? folder;
}

/**
 * Imperative "New Note" prompt: asks for a Title and a Folder and hands the
 * result back via `onSubmit`. Does not create the file itself — the caller
 * does that with `createNote`. Mounted via `showNewNoteDialog`.
 */
export function NewNoteDialog({
  initialTitle,
  folders,
  initialFolder,
  onSubmit,
  onCancel,
}: NewNoteDialogProps) {
  const [title, setTitle] = useState(initialTitle);
  const [chosenFolder, setChosenFolder] = useState(initialFolder);
  const [showError, setShowError] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  // Set by a capture-phase keydown on the wrapper below, ahead of the
  // picker's own Enter handling, so `onPick` can tell an Enter-driven pick
  // (which also submits) apart from a mouse-click pick (which only sets the
  // folder). Reset immediately after `onPick` reads it.
  const pickedViaEnterRef = useRef(false);

  const options = folderOptions(folders);

  useEffect(() => {
    const input = titleInputRef.current;
    if (input && initialTitle) {
      input.select();
    }
  }, [initialTitle]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onCancel]);

  function trySubmit(folder: string) {
    if (canSubmit(title)) {
      onSubmit({ title: title.trim(), folder });
    } else {
      setShowError(true);
      titleInputRef.current?.focus();
    }
  }

  return (
    <div
      className="new-note-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="new-note-modal">
        <div className="new-note-content">
          <h2 className="new-note-title">New Note</h2>

          <label className="new-note-field-label" htmlFor="new-note-title-input">
            Title
          </label>
          <input
            id="new-note-title-input"
            ref={titleInputRef}
            type="text"
            className="new-note-input"
            value={title}
            autoFocus
            onChange={(e) => {
              setTitle(e.target.value);
              if (showError) setShowError(false);
            }}
            onFocus={(e) => {
              if (initialTitle) e.currentTarget.select();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                trySubmit(chosenFolder);
              }
            }}
          />
          {showError && !canSubmit(title) && (
            <div className="new-note-error">Title must contain letters or numbers</div>
          )}

          <div className="new-note-current-folder">
            Folder: {folderLabel(chosenFolder, options)}
          </div>
          <div
            onKeyDownCapture={(e) => {
              if (e.key === 'Enter') pickedViaEnterRef.current = true;
            }}
          >
            <SearchablePicker
              options={options}
              recentIds={[initialFolder]}
              value={chosenFolder}
              inputRef={folderInputRef}
              placeholder="Search folders…"
              ariaLabel="Folder"
              onPick={(option) => {
                setChosenFolder(option.id);
                const viaEnter = pickedViaEnterRef.current;
                pickedViaEnterRef.current = false;
                if (viaEnter) trySubmit(option.id);
              }}
              onCancel={onCancel}
            />
          </div>

          <div className="new-note-actions">
            <button type="button" className="new-note-btn" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="new-note-btn new-note-btn--primary"
              onClick={() => trySubmit(chosenFolder)}
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
