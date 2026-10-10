/**
 * Whether a document is a note (undated) or an event. Passed to
 * `interpretDirective` as `undated: place === 'note'` — a note may only
 * Set/Add, never Change/Shift/Remove (see `src/shared/relationships/AGENTS.md`).
 */
export type DirectivePlace = 'note' | 'event';

/**
 * The `place` a campaign-relative file path is treated as for relationship
 * directives — `'note'` for anything under `notes/`, `'event'` otherwise (a
 * `timeline/…` event file, or any other path). Pure: no IO, no React. Used
 * where only a path says which a file is, e.g. a peek preview.
 */
export function placeForPath(path: string): DirectivePlace {
  return path.startsWith('notes/') ? 'note' : 'event';
}
