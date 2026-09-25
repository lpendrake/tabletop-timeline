/**
 * Resolves the display label for an entity id. Raw ids must never reach the
 * screen: an id missing from `entityLabelMap` falls back to the entity
 * index's own title (via `effectiveLinkLabel`), and only when the id isn't
 * in the index either does it fall back to a neutral placeholder. Pure —
 * no IO, no React.
 */

import { effectiveLinkLabel } from '../../../shared/entity-labels';
import type { EntityIndexEntry } from '../../../types/global';

export const UNKNOWN_ENTITY_LABEL = 'Unknown note';

export function resolveEntityLabel(
  id: string,
  entityLabelMap: ReadonlyMap<string, string>,
  entityIndex: readonly EntityIndexEntry[],
): string {
  const fromMap = entityLabelMap.get(id);
  if (fromMap !== undefined) return fromMap;

  const entry = entityIndex.find((e) => e.id === id);
  if (entry) return effectiveLinkLabel(entry);

  return UNKNOWN_ENTITY_LABEL;
}
