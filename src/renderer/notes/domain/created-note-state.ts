import type { NoteEntry } from '../types';

export interface CreatedNoteForSidebar {
  id: string;
  /**
   * Notes-root-relative folder. `''` is the notes root (not represented in
   * `folderFiles`/`folders`, which are keyed by top-level folder). A nested
   * folder is `"top/level/sub"` — the sidebar keys by the first segment and
   * stores the rest as the entry's `path` prefix, mirroring
   * `scan-folder.ts` and the entity-delta watcher listener.
   */
  folder: string;
  filename: string;
  title: string;
}

export interface FolderFilesState {
  folders: string[];
  folderFiles: Record<string, NoteEntry[] | null>;
}

/**
 * Adds a freshly-created note to the sidebar's `folders`/`folderFiles`
 * state, the same way the entity-delta watcher listener inserts a file
 * under a nested folder (see `useNotesController.ts`'s `onEntityDelta`
 * handler): the top-level folder is the first path segment, and the note's
 * `path` within `folderFiles[topLevel]` is relative to that segment.
 *
 * Returns `null` for a notes-root note (`folder === ''`): the sidebar has no
 * top-level bucket for root-level files, so there is nothing to add here —
 * the note still exists on disk and will show up once a folder scan or the
 * watcher's entity-index delta reflects it.
 */
export function addCreatedNoteToFolderFiles(
  state: FolderFilesState,
  note: CreatedNoteForSidebar,
): FolderFilesState | null {
  if (note.folder === '') return null;

  const segments = note.folder.split('/');
  const topLevel = segments[0];
  const relFolder = segments.slice(1).join('/');
  const relPath = relFolder ? `${relFolder}/${note.filename}` : note.filename;

  const existing = state.folderFiles[topLevel] ?? [];
  const withoutOld = existing.filter((e) => e.path !== relPath);
  const folderFiles: Record<string, NoteEntry[] | null> = {
    ...state.folderFiles,
    [topLevel]: [
      ...withoutOld,
      { id: note.id, path: relPath, title: note.title, kind: 'note' as const },
    ],
  };
  const folders = state.folders.includes(topLevel)
    ? state.folders
    : [...state.folders, topLevel].sort();

  return { folders, folderFiles };
}

/**
 * Every folder path that should be expanded in the sidebar so a
 * newly-created note under `folder` is visible without further clicks:
 * the top-level folder plus every intermediate nested path. `''` (notes
 * root) yields no paths, since the root has no folder row to expand.
 */
export function folderPathsToOpenForCreatedNote(folder: string): string[] {
  if (folder === '') return [];
  const segments = folder.split('/');
  return segments.map((_, i) => segments.slice(0, i + 1).join('/'));
}
