import type { EditorMenuContext } from '../shared/markdown-editor';
import { createNote, type CreatedNote } from './create-note';
import { listNoteFolders } from './list-note-folders';
import { loadLastNoteFolder, saveLastNoteFolder } from './last-note-folder';
import { initialFolder } from './domain/new-note-form';
import { showNewNoteDialog } from './show-new-note-dialog';
import type { EntityIndexEntry } from '../../types/global';

export interface RunNewNoteFromEditorOptions {
  campaignPath: string;
  entityIndex?: readonly EntityIndexEntry[];
  onCreated?: (note: CreatedNote) => void;
}

/** A single-line title seed from the selection — a multi-line selection never becomes the title. */
function titleSeedFromSelection(selectedText: string): string {
  const trimmed = selectedText.trim();
  return trimmed.includes('\n') ? '' : trimmed;
}

/**
 * Orchestrates the "New note…" editor menu action: shows the New Note
 * dialog, which creates the note file in the chosen folder itself (staying
 * open to show a conflict warning or an error), and inserts a `[[id]]` link
 * in place of the range the menu was opened on once a note comes back.
 * Never switches views or opens a tab — the caller decides how the note
 * appears elsewhere (e.g. adding it to a sidebar) via `onCreated`.
 */
export async function runNewNoteFromEditor(
  ctx: EditorMenuContext,
  opts: RunNewNoteFromEditorOptions,
): Promise<CreatedNote | null> {
  const { campaignPath, entityIndex, onCreated } = opts;

  const folders = await listNoteFolders(campaignPath);
  const initial = initialFolder(folders, loadLastNoteFolder(campaignPath));

  const note = await showNewNoteDialog({
    initialTitle: titleSeedFromSelection(ctx.selectedText),
    folders,
    initialFolder: initial,
    create: (input) => createNote({ ...input, campaignPath, entityIndex }),
  });

  if (!note) {
    ctx.view.focus();
    return null;
  }

  saveLastNoteFolder(campaignPath, note.folder);
  ctx.replaceRange(`[[${note.id}]]`);
  onCreated?.(note);
  return note;
}
