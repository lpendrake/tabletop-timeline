/**
 * Entity display for the editor's relationship-directive blanks and the
 * settings default-holder picker: which notes a picker lists, and how an
 * entity id resolves to a label. Raw ids must never reach the screen — an id
 * missing from `entityLabelMap` falls back to the entity index's own title
 * (via `effectiveLinkLabel`), and only when the id isn't in the index either
 * does it fall back to a neutral placeholder. No IO, no React.
 */
import type { EntityIndexEntry } from '../../../types/global';
import type { PickerOption } from '../../shared/searchable-picker';
import { effectiveLinkLabel, UNKNOWN_ENTITY_LABEL } from '../../../shared/entity-labels';

export { UNKNOWN_ENTITY_LABEL };

/** Notes (not events or assets) from the entity index, as searchable-picker options. */
export function notesToPickerOptions(entityIndex: readonly EntityIndexEntry[]): PickerOption[] {
  return entityIndex
    .filter((e) => e.type === 'note')
    .map((e) => ({ id: e.id, path: e.path, label: effectiveLinkLabel(e) }));
}

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
