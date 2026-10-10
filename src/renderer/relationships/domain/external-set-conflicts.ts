/**
 * Turns main's raw `undatedSets()` query into what a note editor pushes
 * into the buffer as `externalSetConflicts`: this buffer's own path
 * excluded (the buffer is the truth for it, not whatever main last derived
 * from disk) and each remaining entry's note title resolved from the entity
 * index, for the conflict message.
 */
import type { ExternalUndatedSet } from '../../../shared/relationships';
import type { EntityIndexEntry } from '../../../types/global';

/** One undated Set declared in another saved note. */
export interface ExternalSetConflictEntry extends ExternalUndatedSet {
  /** Display title for that note, when known (falls back to its path). */
  title?: string;
}

export function externalSetConflictEntries(
  all: readonly ExternalUndatedSet[],
  currentPath: string | null,
  entityIndex: readonly EntityIndexEntry[],
): ExternalSetConflictEntry[] {
  const titleByPath = new Map(entityIndex.map((e) => [e.path, e.title]));
  return all
    .filter((e) => e.path !== currentPath)
    .map((e) => ({ ...e, title: titleByPath.get(e.path) }));
}
