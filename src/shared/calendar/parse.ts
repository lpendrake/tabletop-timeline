import { Calendar } from './calendar.js';
import { CalendarDate } from './date.js';

/**
 * Parse a date string of the form `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM:SS`
 * (negative years accepted) against the given calendar.
 *
 * Returns the parsed CalendarDate on success, or null on any parse / validation failure.
 * Intercalary dates have no textual grammar — tryParse never produces IntercalaryDate.
 */
export function tryParse(calendar: Calendar, text: string): CalendarDate | null {
  return calendar.tryParse(text);
}

/**
 * Format a CalendarDate as a string.
 * Month dates produce `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM:SS`.
 * Intercalary dates produce the festival name (no standard date grammar this round).
 */
export function format(calendar: Calendar, d: CalendarDate): string {
  return calendar.format(d);
}
