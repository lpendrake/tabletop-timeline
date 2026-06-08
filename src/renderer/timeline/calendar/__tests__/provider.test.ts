import { describe, it, expect, beforeEach } from 'vitest';
import { createCalendar, gregorianSpec, GREGORIAN_ID } from '../../../../shared/calendar';
import { CalendarProvider } from '../provider';

beforeEach(() => {
  // Reset to uninitialised state to prevent cross-test leakage.
  CalendarProvider._reset();
});

describe('CalendarProvider — default fallback (no init)', () => {
  it('returns a Golarion calendar when init was never called', () => {
    const cal = CalendarProvider.get();
    // Golarion has 12 months and weekday index 2 is Wealday
    expect(cal.monthCount()).toBe(12);
    expect(cal.weekdayName(2)).toBe('Wealday');
  });
});

describe('CalendarProvider — init / get', () => {
  it('returns the calendar passed to init, not Golarion', () => {
    const gregorian = createCalendar(gregorianSpec);
    CalendarProvider.init(gregorian);
    const result = CalendarProvider.get();
    // Gregorian weekday index 2 is Wednesday, not Wealday
    expect(result.weekdayName(2)).toBe('Wednesday');
    expect(result.monthName(1)).toBe('January');
  });
});

describe('CalendarProvider — singleton identity', () => {
  it('get() returns the same instance on repeated calls after init', () => {
    const gregorian = createCalendar(gregorianSpec);
    CalendarProvider.init(gregorian);
    expect(CalendarProvider.get()).toBe(CalendarProvider.get());
  });

  it('get() returns the same lazily-created Golarion instance across calls', () => {
    // No init — both calls hit the lazy path
    const first = CalendarProvider.get();
    const second = CalendarProvider.get();
    expect(first).toBe(second);
  });
});

describe('CalendarProvider — initFromId', () => {
  it('initFromId(GREGORIAN_ID) yields a Gregorian calendar', () => {
    CalendarProvider.initFromId(GREGORIAN_ID);
    const cal = CalendarProvider.get();
    expect(cal.monthName(1)).toBe('January');
    expect(cal.weekdayName(2)).toBe('Wednesday');
    expect(cal.monthCount()).toBe(12);
  });
});
