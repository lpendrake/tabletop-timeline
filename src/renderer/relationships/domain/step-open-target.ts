/**
 * Resolves a declaring file path (from `RelationshipDelta.declaredIn.path`)
 * to how it should be opened: an event on the timeline, or a note by its
 * entity id. Mirrors the `notes/` / `timeline/` split `buildEntityIndex`
 * scans (see `src/main/AGENTS.md`).
 */

import type { EntityIndexEntry } from '../../../types/global';
import { findEntityIdByNotePath } from '../../notes/domain/link-resolution';

export type StepOpenTarget =
  | { kind: 'event'; filename: string }
  | { kind: 'note'; entityId: string }
  | { kind: 'unknown' };

export function resolveStepOpenTarget(
  path: string,
  entityIndex: readonly EntityIndexEntry[],
): StepOpenTarget {
  if (path.startsWith('timeline/')) {
    return { kind: 'event', filename: path.slice('timeline/'.length) };
  }
  if (path.startsWith('notes/')) {
    const parts = path.split('/');
    const folder = parts[1];
    const rest = parts.slice(2).join('/');
    const entityId = findEntityIdByNotePath(entityIndex, folder, rest);
    if (entityId) return { kind: 'note', entityId };
  }
  return { kind: 'unknown' };
}
