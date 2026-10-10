import type { DirectivePlace } from './config';

/**
 * The `place` a campaign-relative file path is treated as for relationship
 * directives — `'note'` for anything under `notes/`, `'event'` otherwise (a
 * `timeline/…` event file, or any other path). Pure: no IO, no React. Used
 * where only a path says which a file is, e.g. a peek preview.
 */
export function placeForPath(path: string): DirectivePlace {
  return path.startsWith('notes/') ? 'note' : 'event';
}
