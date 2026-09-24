import type { EditorMenuContext } from '../shared/markdown-editor';
import { createNote, type CreatedNote } from './create-note';
import { listNoteFolders } from './list-note-folders';
import { loadLastNoteFolder, saveLastNoteFolder } from './last-note-folder';
import { initialFolder } from './domain/new-note-form';
import { showNewNoteDialog } from './show-new-note-dialog';

export interface RunNewNoteFromEditorOptions {
  campaignPath: string;
  existingIds?: ReadonlySet<string>;
  onCreated?: (note: CreatedNote) => void;
  onError?: (err: unknown) => void;
}

/** A single-line title seed from the selection — a multi-line selection never becomes the title. */
function titleSeedFromSelection(selectedText: string): string {
  const trimmed = selectedText.trim();
  return trimmed.includes('\n') ? '' : trimmed;
}

/**
 * Orchestrates the "New note…" editor menu action: shows the New Note
 * dialog, creates the note file in the chosen folder, and inserts a
 * `[[id]]` link in place of the range the menu was opened on. Never switches
 * views or opens a tab — the caller decides how the note appears elsewhere
 * (e.g. adding it to a sidebar) via `onCreated`.
 */
export async function runNewNoteFromEditor(
  ctx: EditorMenuContext,
  opts: RunNewNoteFromEditorOptions,
): Promise<CreatedNote | null> {
  const { campaignPath, existingIds, onCreated, onError } = opts;

  const folders = await listNoteFolders(campaignPath);
  const initial = initialFolder(folders, loadLastNoteFolder(campaignPath));

  const result = await showNewNoteDialog({
    initialTitle: titleSeedFromSelection(ctx.selectedText),
    folders,
    initialFolder: initial,
  });

  if (!result) {
    ctx.view.focus();
    return null;
  }

  let note: CreatedNote;
  try {
    note = await createNote({
      campaignPath,
      folder: result.folder,
      title: result.title,
      existingIds,
    });
  } catch (err) {
    ctx.view.focus();
    onError?.(err);
    throw err;
  }

  saveLastNoteFolder(campaignPath, result.folder);
  ctx.replaceRange(`[[${note.id}]]`);
  onCreated?.(note);
  return note;
}
