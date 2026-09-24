/**
 * Public entry point for the notes feature. Other features (e.g. the
 * timeline's event editor) embedding notes behaviour — such as the
 * "New note…" editor menu action — import from here rather than reaching
 * into `notes/`'s internals directly.
 */
export { useNewNoteMenuConfig } from './hooks/use-new-note-menu-config';
export { entityFromCreatedNote } from './domain/entity-from-created-note';
export type { CreatedNote } from './create-note';
