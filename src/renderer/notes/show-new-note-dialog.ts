import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { NewNoteDialog } from './components/new-note-dialog';
import type { CreatedNote, CreateNoteResult } from './create-note';

export interface ShowNewNoteDialogOptions {
  initialTitle?: string;
  folders: string[];
  initialFolder: string;
  /**
   * Attempts to create the note. Resolves with the discriminated
   * `CreateNoteResult` — the dialog stays open and shows an inline warning
   * on `'exists'`, or an inline error if this rejects.
   */
  create: (input: { title: string; folder: string }) => Promise<CreateNoteResult>;
}

/**
 * Imperative entry point for the "New Note" dialog, opened from an editor
 * context menu. Mirrors `show-label-override-editor`: mounts a fresh root
 * into a `document.body` host and tears it down once the user gets a note
 * created or cancels. The dialog itself drives `create` and stays open to
 * show a conflict warning or an error, so this resolves only on success or
 * cancel. The dialog renders its conflict link with the same
 * `.cm-note-link`/`data-note-id` markup the editor's wiki-links use, so the
 * global peek hover machinery in `../peek/stack` picks it up on its own —
 * no peek wiring needs to be threaded through here. Must not import
 * `notesData`.
 */
export function showNewNoteDialog(opts: ShowNewNoteDialogOptions): Promise<CreatedNote | null> {
  const { initialTitle = '', folders, initialFolder, create } = opts;

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.zIndex = '1050';
  document.body.appendChild(host);
  const root = createRoot(host);

  return new Promise<CreatedNote | null>((resolve) => {
    const destroy = (result: CreatedNote | null) => {
      queueMicrotask(() => {
        root.unmount();
        host.remove();
      });
      resolve(result);
    };

    root.render(
      createElement(NewNoteDialog, {
        initialTitle,
        folders,
        initialFolder,
        create,
        onSubmit: (note: CreatedNote) => destroy(note),
        onCancel: () => destroy(null),
      }),
    );
  });
}
