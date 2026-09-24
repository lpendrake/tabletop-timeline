import { slugify } from './slugify';
import type { PickerOption } from '../../shared/searchable-picker';

/** The notes root folder is represented as the empty string throughout. */
export const NOTES_ROOT_FOLDER = '';

/**
 * Builds the folder picker's option list: the notes root first, then every
 * known folder. The root's `id` (and the value stored/submitted for it) is
 * the empty string, but its `path` is `'notes'` — not `''` — so it stays
 * matchable when the user types (e.g. `notes` or `root`); an empty `path`
 * would only ever match the empty query, since `matchPath` requires at
 * least one query segment to match a path segment.
 */
export function folderOptions(folders: readonly string[]): PickerOption[] {
  return [
    { id: NOTES_ROOT_FOLDER, path: 'notes', label: 'notes/ (root)' },
    ...folders.map((folder) => ({ id: folder, path: folder, label: folder })),
  ];
}

/**
 * The folder the dialog should open with: `last` when it's the root or
 * still exists among `folders`, otherwise the root.
 */
export function initialFolder(folders: readonly string[], last: string | null): string {
  if (last === NOTES_ROOT_FOLDER) return NOTES_ROOT_FOLDER;
  if (last !== null && folders.includes(last)) return last;
  return NOTES_ROOT_FOLDER;
}

/** Whether `title` slugifies to something non-empty (letters or numbers). */
export function canSubmit(title: string): boolean {
  return slugify(title.trim()) !== '';
}

/**
 * Formats the "already exists" warning shown when the attempted title
 * collides with an existing file. `folderLabel` is the already-resolved
 * display label for the folder the note was being created in (e.g. from
 * `folderOptions`), not a raw folder id.
 */
export function conflictWarningText(attemptedTitle: string, folderLabel: string): string {
  return `A note called "${attemptedTitle}" already exists in ${folderLabel}:`;
}
