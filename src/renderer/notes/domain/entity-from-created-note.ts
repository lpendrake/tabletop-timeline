import type { EntityIndexEntry } from '../../../types/global';
import type { CreatedNote } from '../create-note';

/**
 * Builds the entity-index entry for a note the "New note…" editor action
 * just created, so hosts can upsert it into their local index (via
 * `applyEntityDelta({ op: 'add', entry })`) and have the inserted
 * `[[id]]` link resolve immediately, without waiting for the filesystem
 * watcher's own delta.
 */
export function entityFromCreatedNote(note: CreatedNote): EntityIndexEntry {
  const folderPrefix = note.folder ? `${note.folder}/` : '';
  return {
    id: note.id,
    path: `notes/${folderPrefix}${note.filename}`,
    title: note.title,
    type: 'note',
  };
}
