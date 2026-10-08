import { CalendarProvider } from '../../timeline/calendar/provider';
import { formatDayMonthYear } from '../../timeline/calendar/format';

/**
 * Display date for a ledger entry. `at` is epoch seconds, or null for an undated
 * directive (declared in a note). Dated entries always show the year; narrow
 * places shorten the month. Undated ones read "Undated note" ("Note" when narrow).
 */
export function formatEntryDate(at: number | null, opts: { narrow?: boolean } = {}): string {
  const narrow = opts.narrow === true;
  if (at === null) return narrow ? 'Note' : 'Undated note';
  return formatDayMonthYear(CalendarProvider.get().fromEpochSeconds(at), { shortMonth: narrow });
}

/** The in-game year containing `at` (epoch seconds). */
export function entryYear(at: number): number {
  return CalendarProvider.get().fromEpochSeconds(at).year;
}
