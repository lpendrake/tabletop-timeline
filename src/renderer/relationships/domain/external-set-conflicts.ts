/**
 * Turns main's raw `undatedSets()` query into what a note editor pushes
 * into the buffer as `externalSetConflicts`: this buffer's own path
 * excluded (the buffer is the truth for it, not whatever main last derived
 * from disk) and each remaining entry's note title resolved from the entity
 * index, for the conflict message.
 */
import type { ExternalUndatedSet } from '../../../shared/relationships';
import type { ExternalSetConflictEntry } from '../editor/directives';
import type { EntityIndexEntry } from '../../../types/global';

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
