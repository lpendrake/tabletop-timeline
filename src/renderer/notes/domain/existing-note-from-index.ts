import type { EntityIndexEntry } from '../../../types/global';

export interface ExistingNoteInfo {
  id: string | null;
  title: string;
}

/**
 * Looks up the note already on disk at `path` (campaign-relative, e.g.
 * `notes/npcs/bob.md`) in the host's entity index, for reporting a
 * create-note conflict without a filesystem round-trip.
 *
 * When the entity index has no entry for `path` — the note exists on disk
 * but hasn't been indexed yet — falls back to `id: null` and a title
 * derived from `filename` (with the `.md` extension stripped).
 */
export function existingNoteFromIndex(
  entityIndex: readonly EntityIndexEntry[] | undefined,
  path: string,
  filename: string,
): ExistingNoteInfo {
  const entry = entityIndex?.find((e) => e.path === path);
  if (entry) {
    return { id: entry.id, title: entry.title };
  }
  return { id: null, title: filename.replace(/\.md$/, '') };
}
