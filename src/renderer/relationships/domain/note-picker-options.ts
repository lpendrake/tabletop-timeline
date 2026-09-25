import type { EntityIndexEntry } from '../../../types/global';
import type { PickerOption } from '../../shared/searchable-picker';
import { effectiveLinkLabel } from '../../../shared/entity-labels';

/**
 * Notes (not events or assets) from the entity index, as searchable-picker
 * options. Shared by the settings default-holder picker and the editor's
 * relationship fill-in bubble note pickers — both need the same "notes
 * only" filter and label resolution.
 */
export function notesToPickerOptions(entityIndex: readonly EntityIndexEntry[]): PickerOption[] {
  return entityIndex
    .filter((e) => e.type === 'note')
    .map((e) => ({ id: e.id, path: e.path, label: effectiveLinkLabel(e) }));
}
