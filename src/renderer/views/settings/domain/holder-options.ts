import type { EntityIndexEntry } from '../../../../types/global';
import type { PickerOption } from '../../../shared/searchable-picker';
import { effectiveLinkLabel } from '../../../../shared/entity-labels';

/** Notes (not events or assets) from the entity index, as picker options. */
export function notesToPickerOptions(entityIndex: readonly EntityIndexEntry[]): PickerOption[] {
  return entityIndex
    .filter((e) => e.type === 'note')
    .map((e) => ({ id: e.id, path: e.path, label: effectiveLinkLabel(e) }));
}

/** The current holder's display label, or null when unset or not found. */
export function holderLabel(
  entityIndex: readonly EntityIndexEntry[],
  holderId: string | null,
): string | null {
  if (!holderId) return null;
  const entry = entityIndex.find((e) => e.id === holderId);
  return entry ? effectiveLinkLabel(entry) : holderId;
}
