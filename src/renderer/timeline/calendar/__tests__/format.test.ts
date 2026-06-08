import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  formatExpanded,
  formatCompact,
  formatCompactWithTime,
  formatCardFace,
  formatAxisDay,
  formatAxisDayTick,
  formatAxisHour,
  formatFloatingDay,
  formatFloatingMonth,
  formatNowMarker,
} from '../format';
import { CalendarProvider } from '../provider';
import {
  createCalendar,
  gregorianSpec,
  type CalendarDate,
  type CalendarSpec,
} from '../../../../shared/calendar';

beforeEach(() => {
  CalendarProvider._reset();
});

afterEach(() => {
  CalendarProvider._reset();
});

// ---------------------------------------------------------------------------
// Test 1: formatExpanded — weekday name and era suffix come from the calendar
// ---------------------------------------------------------------------------

describe('formatExpanded — Golarion anchor date with time', () => {
  it('produces "Wealday, 4th of Desnus, 4726 AR — 18:30"', () => {
    const date: CalendarDate = {
      kind: 'month',
      year: 4726,
      month: 5,
      day: 4,
      hour: 18,
      minute: 30,
      second: 0,
    };
    expect(formatExpanded(date)).toBe('Wealday, 4th of Desnus, 4726 AR — 18:30');
  });

  it('omits time portion when all time fields are zero', () => {
    const date: CalendarDate = {
      kind: 'month',
      year: 4726,
      month: 5,
      day: 4,
      hour: 0,
      minute: 0,
      second: 0,
    };
    expect(formatExpanded(date)).toBe('Wealday, 4th of Desnus, 4726 AR');
  });
});

// ---------------------------------------------------------------------------
// Test 2: formatCompact — uses calendar abbrev, NOT slice-derived weekday
// ---------------------------------------------------------------------------

describe('formatCompact — uses calendar weekday abbreviation', () => {
  it('produces "Wea 4 Desnus 4726" using cal.weekdayAbbrev (not .slice(0,3))', () => {
    // Golarion's Wealday has abbrev "Wea" — distinct from "Wed" that slice would give.
    // If format.ts still used weekday().slice(0,3) it would produce "Wed" (old golarian.ts
    // used Gregorian names). "Wea" proves the abbrev comes from the calendar.
    const date: CalendarDate = {
      kind: 'month',
      year: 4726,
      month: 5,
      day: 4,
      hour: 0,
      minute: 0,
      second: 0,
    };
    expect(formatCompact(date)).toBe('Wea 4 Desnus 4726');
  });
});

// ---------------------------------------------------------------------------
// Test 3: backward-compat adapter — legacy shape and new shape give identical output
// ---------------------------------------------------------------------------

describe('backward-compat adapter', () => {
  it('legacy {year,month,day,...} and {kind:"month",...} produce identical formatExpanded output', () => {
    const legacy = { year: 4726, month: 5, day: 4, hour: 18, minute: 30, second: 0 };
    const modern: CalendarDate = { kind: 'month', ...legacy };
    expect(formatExpanded(legacy)).toBe(formatExpanded(modern));
  });

  it('legacy shape produces identical formatCompact output', () => {
    const legacy = { year: 4726, month: 5, day: 4, hour: 0, minute: 0, second: 0 };
    const modern: CalendarDate = { kind: 'month', ...legacy };
    expect(formatCompact(legacy)).toBe(formatCompact(modern));
  });

  it('legacy shape produces identical formatNowMarker output', () => {
    const legacy = { year: 4726, month: 5, day: 4, hour: 15, minute: 0, second: 0 };
    const modern: CalendarDate = { kind: 'month', ...legacy };
    expect(formatNowMarker(legacy)).toEqual(formatNowMarker(modern));
  });
});

// ---------------------------------------------------------------------------
// Test 4: after CalendarProvider.init(gregorian), formatters use Gregorian labels
// ---------------------------------------------------------------------------

describe('Gregorian calendar labels and CE suffix', () => {
  beforeEach(() => {
    CalendarProvider.init(createCalendar(gregorianSpec));
  });

  it('formatExpanded uses Gregorian month name and CE suffix', () => {
    const date: CalendarDate = {
      kind: 'month',
      year: 2000,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
    };
    const result = formatExpanded(date);
    expect(result).toContain('January');
    expect(result).toContain('CE');
    expect(result).not.toContain('AR');
    expect(result).not.toContain('Abadius');
  });

  it('formatExpanded uses Gregorian weekday names', () => {
    const date: CalendarDate = {
      kind: 'month',
      year: 2000,
      month: 6,
      day: 15,
      hour: 0,
      minute: 0,
      second: 0,
    };
    const result = formatExpanded(date);
    // Must be one of the Gregorian weekday names (not Golarion ones)
    const gregorianWeekdays = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ];
    const hasGregorianWeekday = gregorianWeekdays.some((wd) => result.startsWith(wd));
    expect(hasGregorianWeekday).toBe(true);
  });

  it('formatCompact uses Gregorian month name and 3-letter weekday abbrev', () => {
    const date: CalendarDate = {
      kind: 'month',
      year: 2000,
      month: 3,
      day: 20,
      hour: 0,
      minute: 0,
      second: 0,
    };
    const result = formatCompact(date);
    expect(result).toContain('March');
    expect(result).toContain('2000');
  });

  it('formatFloatingMonth uses CE suffix', () => {
    const date: CalendarDate = {
      kind: 'month',
      year: 2000,
      month: 7,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
    };
    expect(formatFloatingMonth(date)).toBe('July 2000 CE');
  });
});

// ---------------------------------------------------------------------------
// Test 5: formatNowMarker — 3-tuple shape, era suffix, null time at midnight
// ---------------------------------------------------------------------------

describe('formatNowMarker', () => {
  it('returns ["4th of Desnus", "4726 AR", null] at midnight', () => {
    const date: CalendarDate = {
      kind: 'month',
      year: 4726,
      month: 5,
      day: 4,
      hour: 0,
      minute: 0,
      second: 0,
    };
    const [dayMonth, yearEra, time] = formatNowMarker(date);
    expect(dayMonth).toBe('4th of Desnus');
    expect(yearEra).toBe('4726 AR');
    expect(time).toBeNull();
  });

  it('returns non-null time when hour is set', () => {
    const date: CalendarDate = {
      kind: 'month',
      year: 4726,
      month: 5,
      day: 4,
      hour: 15,
      minute: 0,
      second: 0,
    };
    const [dayMonth, yearEra, time] = formatNowMarker(date);
    expect(dayMonth).toBe('4th of Desnus');
    expect(yearEra).toBe('4726 AR');
    expect(time).toBe('15:00');
  });

  it('returns non-null time when only minute is set', () => {
    const date: CalendarDate = {
      kind: 'month',
      year: 4726,
      month: 5,
      day: 4,
      hour: 0,
      minute: 30,
      second: 0,
    };
    const [, , time] = formatNowMarker(date);
    expect(time).toBe('00:30');
  });
});

// ---------------------------------------------------------------------------
// Test 6: intercalary CalendarDate formats using the festival name
// ---------------------------------------------------------------------------

/**
 * Minimal custom calendar with a single intercalary festival day "Starfall"
 * placed after month 1, pausing the week cycle.
 */
const festivalCalendarSpec: CalendarSpec = {
  id: 'test',
  name: 'Test Calendar',
  kind: 'custom',
  time: { hoursPerDay: 24, minutesPerHour: 60, secondsPerMinute: 60 },
  months: [
    { name: 'FirstMonth', abbrev: 'Fir', length: 30 },
    { name: 'SecondMonth', abbrev: 'Sec', length: 30 },
  ],
  week: {
    days: [
      { name: 'Dayone', abbrev: 'D1' },
      { name: 'Daytwo', abbrev: 'D2' },
      { name: 'Daythree', abbrev: 'D3' },
    ],
    epochWeekdayIndex: 0,
  },
  intercalary: [
    {
      name: 'Starfall',
      afterMonthIndex: 1,
      participatesInWeek: false,
    },
  ],
  eras: [{ name: 'Festival Era', suffix: 'FE', startYear: -99999 }],
  leap: { ruleId: 'none' },
};

describe('intercalary date formatting', () => {
  beforeEach(() => {
    CalendarProvider.init(createCalendar(festivalCalendarSpec));
  });

  it('formatExpanded uses the festival name instead of weekday/month/day', () => {
    const date: CalendarDate = {
      kind: 'intercalary',
      intercalaryIndex: 0,
      year: 100,
      hour: 0,
      minute: 0,
      second: 0,
    };
    expect(formatExpanded(date)).toBe('Starfall, 100 FE');
  });

  it('formatExpanded includes time for an intercalary day when non-midnight', () => {
    const date: CalendarDate = {
      kind: 'intercalary',
      intercalaryIndex: 0,
      year: 100,
      hour: 12,
      minute: 30,
      second: 0,
    };
    expect(formatExpanded(date)).toBe('Starfall, 100 FE — 12:30');
  });

  it('formatCompact returns festival name and year for intercalary date', () => {
    const date: CalendarDate = {
      kind: 'intercalary',
      intercalaryIndex: 0,
      year: 100,
      hour: 0,
      minute: 0,
      second: 0,
    };
    expect(formatCompact(date)).toBe('Starfall 100');
  });

  it('formatNowMarker returns festival name as first element for intercalary date', () => {
    const date: CalendarDate = {
      kind: 'intercalary',
      intercalaryIndex: 0,
      year: 100,
      hour: 0,
      minute: 0,
      second: 0,
    };
    const [label, yearEra, time] = formatNowMarker(date);
    expect(label).toBe('Starfall');
    expect(yearEra).toBe('100 FE');
    expect(time).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Additional formatter coverage
// ---------------------------------------------------------------------------

describe('formatCompactWithTime', () => {
  it('appends time when non-midnight', () => {
    const date: CalendarDate = {
      kind: 'month',
      year: 4726,
      month: 5,
      day: 4,
      hour: 9,
      minute: 15,
      second: 0,
    };
    expect(formatCompactWithTime(date)).toBe('Wea 4 Desnus 4726 — 09:15');
  });

  it('returns compact string without time at midnight', () => {
    const date: CalendarDate = {
      kind: 'month',
      year: 4726,
      month: 5,
      day: 4,
      hour: 0,
      minute: 0,
      second: 0,
    };
    expect(formatCompactWithTime(date)).toBe('Wea 4 Desnus 4726');
  });
});

describe('formatCardFace', () => {
  it('includes weekday abbreviation in parentheses', () => {
    const date: CalendarDate = {
      kind: 'month',
      year: 4726,
      month: 5,
      day: 4,
      hour: 0,
      minute: 0,
      second: 0,
    };
    expect(formatCardFace(date)).toBe('4726, Desnus, 4th (Wea)');
  });

  it('appends time when non-midnight', () => {
    const date: CalendarDate = {
      kind: 'month',
      year: 4726,
      month: 5,
      day: 4,
      hour: 1,
      minute: 30,
      second: 0,
    };
    expect(formatCardFace(date)).toBe('4726, Desnus, 4th (Wea), 01:30');
  });
});

describe('formatAxisDay', () => {
  it('returns weekday abbrev + day + month name', () => {
    const date: CalendarDate = {
      kind: 'month',
      year: 4726,
      month: 5,
      day: 4,
      hour: 0,
      minute: 0,
      second: 0,
    };
    expect(formatAxisDay(date)).toBe('Wea 4 Desnus');
  });
});

describe('formatAxisDayTick', () => {
  it('returns only day number at short level', () => {
    const date: CalendarDate = {
      kind: 'month',
      year: 4726,
      month: 5,
      day: 4,
      hour: 0,
      minute: 0,
      second: 0,
    };
    expect(formatAxisDayTick(date, 'short')).toBe('4');
  });

  it('returns weekday abbrev + day at full level', () => {
    const date: CalendarDate = {
      kind: 'month',
      year: 4726,
      month: 5,
      day: 4,
      hour: 0,
      minute: 0,
      second: 0,
    };
    expect(formatAxisDayTick(date, 'full')).toBe('Wea 4');
  });
});

describe('formatAxisHour', () => {
  it('returns HH:MM format', () => {
    const date: CalendarDate = {
      kind: 'month',
      year: 4726,
      month: 5,
      day: 4,
      hour: 9,
      minute: 0,
      second: 0,
    };
    expect(formatAxisHour(date)).toBe('09:00');
  });

  it('returns only hour when shorten=true and minute=0', () => {
    const date: CalendarDate = {
      kind: 'month',
      year: 4726,
      month: 5,
      day: 4,
      hour: 9,
      minute: 0,
      second: 0,
    };
    expect(formatAxisHour(date, true)).toBe('09');
  });
});

describe('formatFloatingDay', () => {
  it('returns month day, weekday, year and era', () => {
    const date: CalendarDate = {
      kind: 'month',
      year: 4726,
      month: 5,
      day: 4,
      hour: 0,
      minute: 0,
      second: 0,
    };
    expect(formatFloatingDay(date)).toBe('Desnus 4th, Wealday, 4726 AR');
  });
});
