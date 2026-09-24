import { useEffect, useRef, useState } from 'react';
import { SearchablePicker } from '../../shared/searchable-picker';
import { canSubmit, conflictWarningText, folderOptions } from '../domain/new-note-form';
import type { CreatedNote, CreateNoteResult, ExistingNoteConflict } from '../create-note';
import '../styles/new-note-dialog.css';

export interface NewNoteDialogProps {
  initialTitle: string;
  folders: string[];
  initialFolder: string;
  create: (input: { title: string; folder: string }) => Promise<CreateNoteResult>;
  onSubmit(note: CreatedNote): void;
  onCancel(): void;
}

/** The attempt that produced the currently-shown conflict, so a resubmit of
 * the exact same title/folder (e.g. a stray Enter) doesn't re-run `create`. */
interface ConflictState {
  existing: ExistingNoteConflict;
  title: string;
  folder: string;
}

function folderLabel(folder: string, options: ReturnType<typeof folderOptions>): string {
  return options.find((option) => option.id === folder)?.label ?? folder;
}

/**
 * Imperative "New Note" prompt: asks for a Title and a Folder, then creates
 * the note itself via `create`. Stays open and shows an inline warning when
 * the file already exists (with a hoverable link to peek at it), or an
 * inline error on a thrown failure. The conflict link is rendered with the
 * same `.cm-note-link`/`data-note-id` markup the editor's wiki-links use, so
 * the global peek hover machinery in `../peek/stack` (wired up once via
 * `initPeek`) picks it up on its own — this component never imports
 * `../peek/stack` or `notesData` itself.
 */
export function NewNoteDialog({
  initialTitle,
  folders,
  initialFolder,
  create,
  onSubmit,
  onCancel,
}: NewNoteDialogProps) {
  const [title, setTitle] = useState(initialTitle);
  const [chosenFolder, setChosenFolder] = useState(initialFolder);
  const [showError, setShowError] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

  function clearWarning() {
    if (conflict) setConflict(null);
    if (errorMessage) setErrorMessage(null);
  }

  function handleBack() {
    setConflict(null);
    setErrorMessage(null);
    titleInputRef.current?.focus();
  }

  async function trySubmit(folder: string) {
    const trimmed = title.trim();
    if (!canSubmit(title)) {
      setShowError(true);
      titleInputRef.current?.focus();
      return;
    }
    // The warning is already showing for this exact title/folder — a stray
    // Enter shouldn't blindly re-run create() and re-show the same warning.
    if (conflict && conflict.title === trimmed && conflict.folder === folder) {
      return;
    }
    setErrorMessage(null);
    try {
      const result = await create({ title: trimmed, folder });
      if (result.status === 'created') {
        onSubmit(result.note);
      } else {
        setConflict({ existing: result.existing, title: trimmed, folder });
      }
    } catch (err) {
      setConflict(null);
      setErrorMessage(err instanceof Error ? err.message : String(err));
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
              clearWarning();
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
                clearWarning();
                const viaEnter = pickedViaEnterRef.current;
                pickedViaEnterRef.current = false;
                if (viaEnter) trySubmit(option.id);
              }}
              onCancel={onCancel}
            />
          </div>

          {conflict && (
            <div className="new-note-conflict">
              <div className="new-note-conflict-text">
                {conflictWarningText(conflict.title, folderLabel(conflict.folder, options))}
              </div>
              {conflict.existing.id ? (
                <span
                  className="new-note-conflict-link cm-note-link"
                  data-note-id={conflict.existing.id}
                >
                  {conflict.existing.title}
                </span>
              ) : (
                <span className="new-note-conflict-path">{conflict.existing.path}</span>
              )}
              <button type="button" className="new-note-btn new-note-back-btn" onClick={handleBack}>
                Back
              </button>
            </div>
          )}

          {errorMessage && <div className="new-note-error">{errorMessage}</div>}

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
