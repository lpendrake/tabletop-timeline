import type { Calendar } from '../../../shared/calendar';

export type ExtendUnit = 'hour' | 'half-day' | 'day' | 'week' | 'month';

/**
 * Add a fixed or calendar-aware duration to an in-game instant.
 *
 * `hour` / `half-day` / `day` / `week` are fixed-length in this engine (days
 * are constant-length in seconds), so they're plain arithmetic. `month` is
 * calendar-aware because month lengths vary — it walks to the same
 * day-of-month in the following month, wraps the year via `monthCount()`,
 * and clamps the day if the target month is shorter.
 */
export function addInGameDuration(epochSeconds: number, unit: ExtendUnit, cal: Calendar): number {
  switch (unit) {
    case 'hour':
      return epochSeconds + 3600;
    case 'half-day':
      return epochSeconds + cal.secondsPerDay() / 2;
    case 'day':
      return epochSeconds + cal.secondsPerDay();
    case 'week':
      return epochSeconds + cal.weekLength() * cal.secondsPerDay();
    case 'month': {
      const d = cal.fromEpochSeconds(epochSeconds);
      // Intercalary (festival) days don't belong to a month — fall back to
      // treating "a month" as a fixed shift so the extend action still does
      // something sensible rather than throwing.
      if (d.kind !== 'month') {
        return epochSeconds + cal.secondsPerDay() * 30;
      }
      let newMonth = d.month + 1;
      let newYear = d.year;
      if (newMonth > cal.monthCount()) {
        newMonth = 1;
        newYear += 1;
      }
      const maxDay = cal.daysInMonth(newYear, newMonth);
      const newDay = Math.min(d.day, maxDay);
      return cal.toEpochSeconds({
        kind: 'month',
        year: newYear,
        month: newMonth,
        day: newDay,
        hour: d.hour,
        minute: d.minute,
        second: d.second,
      });
    }
  }
}
