import { describe, it, expect } from 'vitest';
import { addInGameDuration } from '../add-in-game-duration';
import { createCalendar, golarionSpec } from '../../../../shared/calendar';

const cal = createCalendar(golarionSpec);

// Golarion months (1-based): 1 Abadius(31) 2 Calistril(28/29) 3 Pharast(31)
// 4 Gozran(30) 5 Desnus(31) ... 12 Kuthona(31). 12 months total.

function seconds(year: number, month: number, day: number, hour = 0): number {
  return cal.toEpochSeconds({ kind: 'month', year, month, day, hour, minute: 0, second: 0 });
}

describe('addInGameDuration — fixed-length units', () => {
  it('+1 hour adds exactly 3600 seconds', () => {
    const start = seconds(4726, 5, 4, 12);
    expect(addInGameDuration(start, 'hour', cal)).toBe(start + 3600);
  });

  it('+1 day adds exactly one secondsPerDay', () => {
    const start = seconds(4726, 5, 4, 12);
    expect(addInGameDuration(start, 'day', cal)).toBe(start + cal.secondsPerDay());
  });

  it('+1 week adds weekLength() * secondsPerDay()', () => {
    const start = seconds(4726, 5, 4, 12);
    expect(addInGameDuration(start, 'week', cal)).toBe(
      start + cal.weekLength() * cal.secondsPerDay(),
    );
  });
});

describe('addInGameDuration — half-day', () => {
  it('adds secondsPerDay() / 2', () => {
    const start = seconds(4726, 5, 4, 12);
    expect(addInGameDuration(start, 'half-day', cal)).toBe(start + cal.secondsPerDay() / 2);
  });
});

describe('addInGameDuration — month, simple increment', () => {
  it('from mid-month lands in the next month, same day-of-month', () => {
    // 15th of Abadius (month 1) -> 15th of Calistril (month 2)
    const start = seconds(4726, 1, 15, 9);
    const result = addInGameDuration(start, 'month', cal);
    const d = cal.fromEpochSeconds(result);
    expect(d.kind).toBe('month');
    if (d.kind === 'month') {
      expect(d.month).toBe(2);
      expect(d.day).toBe(15);
      expect(d.year).toBe(4726);
      expect(d.hour).toBe(9);
    }
  });
});

describe('addInGameDuration — month, year wrap', () => {
  it('wrapping past the last month rolls the year over', () => {
    // 10th of Kuthona (month 12, last month) -> 10th of Abadius (month 1), next year
    const start = seconds(4726, 12, 10);
    const result = addInGameDuration(start, 'month', cal);
    const d = cal.fromEpochSeconds(result);
    expect(d.kind).toBe('month');
    if (d.kind === 'month') {
      expect(d.month).toBe(1);
      expect(d.day).toBe(10);
      expect(d.year).toBe(4727);
    }
  });
});

describe('addInGameDuration — month, day clamp', () => {
  it('clamps the day when the target month is shorter', () => {
    // 30th of Abadius (month 1, 31 days) -> Calistril (month 2) only has 28
    // days in a non-leap year, so the day clamps to 28.
    const start = seconds(4725, 1, 30);
    const result = addInGameDuration(start, 'month', cal);
    const d = cal.fromEpochSeconds(result);
    expect(d.kind).toBe('month');
    if (d.kind === 'month') {
      expect(d.month).toBe(2);
      expect(d.day).toBe(cal.daysInMonth(4725, 2));
      expect(d.day).toBeLessThan(30);
    }
  });
});
