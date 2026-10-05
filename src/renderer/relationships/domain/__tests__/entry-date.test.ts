import { describe, it, expect, beforeEach } from 'vitest';
import { formatEntryDate } from '../entry-date';
import { CalendarProvider } from '../../../timeline/calendar/provider';

beforeEach(() => {
  CalendarProvider._reset();
});

describe('formatEntryDate', () => {
  it('shows Undated note / Note for null', () => {
    expect(formatEntryDate(null)).toBe('Undated note');
    expect(formatEntryDate(null, { narrow: false })).toBe('Undated note');
    expect(formatEntryDate(null, { narrow: true })).toBe('Note');
  });

  it('shows day, month and year for a dated entry, shortening the month when narrow', () => {
    const cal = CalendarProvider.get();
    const month = Array.from({ length: cal.monthCount() }, (_, i) => i + 1).find(
      (m) => cal.monthName(m) === 'Lamashan',
    )!;
    const at = cal.toEpochSeconds({
      kind: 'month',
      year: 4725,
      month,
      day: 12,
      hour: 0,
      minute: 0,
      second: 0,
    });
    expect(formatEntryDate(at)).toBe('12 Lamashan 4725');
    expect(formatEntryDate(at, { narrow: true })).toBe('12 Lam 4725');
  });
});
