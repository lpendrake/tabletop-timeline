/**
 * Derives the `place` a peeked file should be treated as for relationship
 * directives — `'note'` for anything under `notes/`, `'event'` otherwise
 * (a `timeline/…` event file, or any other campaign-relative path peek
 * might one day show). Pure: no IO, no React — see
 * `RelationshipDirectivesHostConfig.place` for what this feeds.
 */
export function placeForPeekPath(path: string): 'note' | 'event' {
  return path.startsWith('notes/') ? 'note' : 'event';
}
