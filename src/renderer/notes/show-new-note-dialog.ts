import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { NewNoteDialog } from './components/new-note-dialog';

export interface ShowNewNoteDialogOptions {
  initialTitle?: string;
  folders: string[];
  initialFolder: string;
}

export interface NewNoteResult {
  title: string;
  folder: string;
}

/**
 * Imperative entry point for the "New Note" dialog, opened from an editor
 * context menu (wiring is a later task). Mirrors `show-label-override-editor`:
 * mounts a fresh root into a `document.body` host and tears it down once the
 * user submits or cancels. Does not create the note file itself — the caller
 * does that with `createNote` using the resolved title/folder. Must not
 * import `notesData`.
 */
export function showNewNoteDialog(opts: ShowNewNoteDialogOptions): Promise<NewNoteResult | null> {
  const { initialTitle = '', folders, initialFolder } = opts;

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.zIndex = '2100';
  document.body.appendChild(host);
  const root = createRoot(host);

  return new Promise<NewNoteResult | null>((resolve) => {
    const destroy = (result: NewNoteResult | null) => {
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
        onSubmit: (result: NewNoteResult) => destroy(result),
        onCancel: () => destroy(null),
      }),
    );
  });
}
