import type { Calendar } from '../../../../shared/calendar';
import type { EditorBuffer } from '../domain';

/**
 * The event buffer's date, parsed against `calendar` and converted to epoch
 * seconds — the point in in-game time relationship directives declared on
 * this event are anchored to. `null` when the buffer's date text doesn't
 * parse (e.g. mid-edit, or not yet set).
 */
export function bufferEpochSeconds(buffer: EditorBuffer, calendar: Calendar): number | null {
  const parsed = calendar.tryParse(buffer.date.trim());
  return parsed ? calendar.toEpochSeconds(parsed) : null;
}
