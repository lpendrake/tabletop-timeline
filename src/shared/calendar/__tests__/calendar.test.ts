import { describe, it, expect } from 'vitest';
import {
  createCalendar,
  golarionSpec,
  gregorianSpec,
  GOLARION_ID,
  GREGORIAN_ID,
  resolveLeapRule,
  NO_OP_RULE,
  resolveCalendar,
  getSystemCalendar,
} from '../index.js';
import type { CalendarSpec, EraSpec } from '../index.js';
import type { MonthDate, IntercalaryDate } from '../index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function monthDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): MonthDate {
  return { kind: 'month', year, month, day, hour, minute, second };
}

function intercalaryDate(
  year: number,
  intercalaryIndex: number,
  hour = 0,
  minute = 0,
  second = 0,
): IntercalaryDate {
  return { kind: 'intercalary', year, intercalaryIndex, hour, minute, second };
}

// ---------------------------------------------------------------------------
// Birthright-like spec for configurable-calendar tests
// ---------------------------------------------------------------------------
const birthrightSpec: CalendarSpec = {
  id: 'brth',
  name: 'Birthright-like',
  kind: 'custom',
  time: { hoursPerDay: 25, minutesPerHour: 60, secondsPerMinute: 60 },
  months: Array.from({ length: 12 }, (_, i) => ({
    name: `Month${i + 1}`,
    abbrev: `M${i + 1}`.padStart(3, '0'),
    length: 32,
  })),
  week: {
    days: [
      { name: 'Alpha', abbrev: 'Alp' },
      { name: 'Beta', abbrev: 'Bet' },
      { name: 'Gamma', abbrev: 'Gam' },
      { name: 'Delta', abbrev: 'Del' },
      { name: 'Epsilon', abbrev: 'Eps' },
      { name: 'Zeta', abbrev: 'Zet' },
      { name: 'Eta', abbrev: 'Eta' },
      { name: 'Theta', abbrev: 'The' },
    ],
    epochWeekdayIndex: 0,
  },
  intercalary: [
    {
      // Festival at year-start (before month 1) — DOES participate in week.
      name: 'New Year Festival',
      abbrev: 'NYF',
      afterMonthIndex: 0,
      order: 0,
      participatesInWeek: true,
    },
    {
      // Midsummer pause (between month 6 and 7) — does NOT participate in week.
      name: 'Midsummer Silence',
      abbrev: 'MSS',
      afterMonthIndex: 6,
      order: 0,
      participatesInWeek: false,
    },
  ],
  eras: [
    { name: 'Age of War', suffix: 'AW', startYear: -50000 },
    { name: 'Age of Peace', suffix: 'AP', startYear: 0 },
    { name: 'Age of Stars', suffix: 'AS', startYear: 1000 },
  ],
  leap: { ruleId: 'none' },
};

// ---------------------------------------------------------------------------
// Test 1 — Golarion epoch anchor
// ---------------------------------------------------------------------------

describe('Test 1 — Golarion epoch', () => {
  const cal = createCalendar(golarionSpec);

  it('epoch day 0 is year 0, Abadius 1', () => {
    const d = monthDate(0, 1, 1);
    expect(cal.toEpochDays(d)).toBe(0);
  });

  it('epoch seconds 0 is year 0, Abadius 1, midnight', () => {
    const d = monthDate(0, 1, 1);
    expect(cal.toEpochSeconds(d)).toBe(0);
  });

  it('fromEpochDays(0) returns year 0, Abadius 1', () => {
    const d = cal.fromEpochDays(0);
    expect(d.kind).toBe('month');
    if (d.kind === 'month') {
      expect(d.year).toBe(0);
      expect(d.month).toBe(1);
      expect(d.day).toBe(1);
    }
  });

  it('fromEpochSeconds(0) returns year 0, Abadius 1, midnight', () => {
    const d = cal.fromEpochSeconds(0);
    expect(d.year).toBe(0);
    expect(d.hour).toBe(0);
    expect(d.minute).toBe(0);
    expect(d.second).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — Golarion weekday anchor: 4726-05-04 === Wealday (index 2)
// ---------------------------------------------------------------------------

describe('Test 2 — Golarion weekday anchor', () => {
  const cal = createCalendar(golarionSpec);

  it('4726-05-04 has weekday index 2', () => {
    const d = monthDate(4726, 5, 4);
    expect(cal.weekdayIndex(d)).toBe(2);
  });

  it('weekday index 2 is "Wealday" (proper Pathfinder name)', () => {
    expect(cal.weekdayName(2)).toBe('Wealday');
  });

  it('4726-05-04 weekdayName is "Wealday"', () => {
    const d = monthDate(4726, 5, 4);
    const idx = cal.weekdayIndex(d);
    expect(idx).not.toBeNull();
    expect(cal.weekdayName(idx!)).toBe('Wealday');
  });

  it('all 7 Pathfinder weekday names are correct', () => {
    const expected = ['Moonday', 'Toilday', 'Wealday', 'Oathday', 'Fireday', 'Starday', 'Sunday'];
    for (let i = 0; i < 7; i++) {
      expect(cal.weekdayName(i)).toBe(expected[i]);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 3 — Golarion Gregorian leap rule
// ---------------------------------------------------------------------------

describe('Test 3 — Golarion leap years', () => {
  const cal = createCalendar(golarionSpec);

  it('year 2024 is a leap year (divisible by 4, not 100)', () => {
    expect(cal.isLeapYear(2024)).toBe(true);
    expect(cal.daysInMonth(2024, 2)).toBe(29); // Calistril gets extra day
  });

  it('year 2023 is not a leap year', () => {
    expect(cal.isLeapYear(2023)).toBe(false);
    expect(cal.daysInMonth(2023, 2)).toBe(28);
  });

  it('year 1900 is not a leap year (divisible by 100, not 400)', () => {
    expect(cal.isLeapYear(1900)).toBe(false);
    expect(cal.daysInMonth(1900, 2)).toBe(28);
  });

  it('year 2000 is a leap year (divisible by 400)', () => {
    expect(cal.isLeapYear(2000)).toBe(true);
    expect(cal.daysInMonth(2000, 2)).toBe(29);
  });

  it('leap year has 366 days', () => {
    expect(cal.daysInYear(2024)).toBe(366);
  });

  it('non-leap year has 365 days', () => {
    expect(cal.daysInYear(2023)).toBe(365);
  });
});

// ---------------------------------------------------------------------------
// Test 4 — Round-trip property (master invariant)
// ---------------------------------------------------------------------------

describe('Test 4 — Round-trip toEpochSeconds / fromEpochSeconds', () => {
  const golarion = createCalendar(golarionSpec);
  const gregorianCal = createCalendar(gregorianSpec);
  const birthright = createCalendar(birthrightSpec);

  const samples = [
    0,
    1,
    -1,
    86400, // exactly one day
    -86400,
    86399, // one second before midnight day 1
    365 * 86400, // start of year 1
    -365 * 86400, // start of year -1
    400 * 365 * 86400 + 97 * 86400, // one Gregorian cycle
    -(400 * 365 * 86400 + 97 * 86400),
    12345678,
    -12345678,
    999999999,
    -999999999,
  ];

  it.each(samples)('Golarion round-trips seconds=%i', (s) => {
    expect(golarion.toEpochSeconds(golarion.fromEpochSeconds(s))).toBe(s);
  });

  it.each(samples)('Gregorian round-trips seconds=%i', (s) => {
    expect(gregorianCal.toEpochSeconds(gregorianCal.fromEpochSeconds(s))).toBe(s);
  });

  it.each(samples)('Birthright round-trips seconds=%i', (s) => {
    // Birthright has 25h days = 90000 s/day, skip samples that don't align to second boundary.
    expect(birthright.toEpochSeconds(birthright.fromEpochSeconds(s))).toBe(s);
  });

  it('round-trips a large positive epoch second', () => {
    const s = 4726 * 365 * 86400;
    expect(golarion.toEpochSeconds(golarion.fromEpochSeconds(s))).toBe(s);
  });

  it('round-trips a large negative epoch second', () => {
    const s = -3000 * 365 * 86400;
    expect(golarion.toEpochSeconds(golarion.fromEpochSeconds(s))).toBe(s);
  });
});

// ---------------------------------------------------------------------------
// Test 5 — Pre-epoch (negative year) round-trip
// ---------------------------------------------------------------------------

describe('Test 5 — Negative year handling', () => {
  const cal = createCalendar(golarionSpec);

  it('year -1 round-trips through toEpochDays / fromEpochDays', () => {
    const d = monthDate(-1, 1, 1);
    const day = cal.toEpochDays(d);
    expect(day).toBeLessThan(0);
    const back = cal.fromEpochDays(day);
    expect(back.year).toBe(-1);
    if (back.kind === 'month') {
      expect(back.month).toBe(1);
      expect(back.day).toBe(1);
    }
  });

  it('year -5 Calistril 15 round-trips', () => {
    const d = monthDate(-5, 2, 15);
    const day = cal.toEpochDays(d);
    const back = cal.fromEpochDays(day);
    expect(back.year).toBe(-5);
    if (back.kind === 'month') {
      expect(back.month).toBe(2);
      expect(back.day).toBe(15);
    }
  });

  it('year -100 last day round-trips', () => {
    const d = monthDate(-100, 12, 31);
    const day = cal.toEpochDays(d);
    const back = cal.fromEpochDays(day);
    expect(back.year).toBe(-100);
    if (back.kind === 'month') {
      expect(back.month).toBe(12);
      expect(back.day).toBe(31);
    }
  });

  it('year -400 round-trips (one full negative cycle)', () => {
    const d = monthDate(-400, 6, 15);
    const day = cal.toEpochDays(d);
    const back = cal.fromEpochDays(day);
    expect(back.year).toBe(-400);
  });

  it('day before epoch (day -1) is year -1, Kuthona 31', () => {
    const back = cal.fromEpochDays(-1);
    expect(back.year).toBe(-1);
    if (back.kind === 'month') {
      expect(back.month).toBe(12);
      expect(back.day).toBe(31);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 6 — Birthright configurable calendar
// ---------------------------------------------------------------------------

describe('Test 6 — Birthright configurable calendar', () => {
  const cal = createCalendar(birthrightSpec);

  it('secondsPerDay is 25*60*60 = 90000', () => {
    expect(cal.secondsPerDay()).toBe(90000);
  });

  it('non-leap year has 12*32 + 2 intercalary = 386 days', () => {
    expect(cal.daysInYear(0)).toBe(12 * 32 + 2);
    expect(cal.daysInYear(1)).toBe(386);
  });

  it('has 8 weekdays', () => {
    expect(cal.weekLength()).toBe(8);
  });

  it('week-PAUSING intercalary day returns weekdayIndex === null', () => {
    // Midsummer Silence is intercalaryIndex 1, afterMonthIndex 6 (between month 6 and 7).
    const midsummer = intercalaryDate(0, 1);
    expect(cal.weekdayIndex(midsummer)).toBeNull();
  });

  it('week-participating intercalary day returns a non-null weekday index', () => {
    // New Year Festival is intercalaryIndex 0, afterMonthIndex 0 (year start).
    const nyf = intercalaryDate(0, 0);
    expect(cal.weekdayIndex(nyf)).not.toBeNull();
  });

  it('day after a week-pausing intercalary day has same weekday as day before it', () => {
    // The Midsummer Silence sits between Month6 and Month7.
    // Day before: last day of Month6, year 0.
    const beforePause = monthDate(0, 6, 32);
    // Day after: first day of Month7, year 0.
    const afterPause = monthDate(0, 7, 1);

    const idxBefore = cal.weekdayIndex(beforePause)!;
    const idxAfter = cal.weekdayIndex(afterPause)!;

    // After the pause the weekday should advance by exactly 1 (the pause itself is skipped).
    expect(idxAfter).toBe((idxBefore + 1) % 8);
  });

  it('day after a week-PARTICIPATING intercalary advances the weekday normally', () => {
    // New Year Festival (participatesInWeek: true) is before Month1 of each year.
    // epochWeekdayIndex = 0, so NYF at year 0 gets weekday 0.
    const nyf = intercalaryDate(0, 0);
    const firstDay = monthDate(0, 1, 1);
    const nyfIdx = cal.weekdayIndex(nyf)!;
    const firstDayIdx = cal.weekdayIndex(firstDay)!;
    // First day of Month1 should be one step after the NYF.
    expect(firstDayIdx).toBe((nyfIdx + 1) % 8);
  });

  it('Birthright round-trips fromEpochDays / toEpochDays through intercalary days', () => {
    // Go to year 0, Month7, day 1 (just after the Midsummer Silence).
    const d = monthDate(0, 7, 1);
    const day = cal.toEpochDays(d);
    const back = cal.fromEpochDays(day);
    expect(back.year).toBe(0);
    if (back.kind === 'month') {
      expect(back.month).toBe(7);
      expect(back.day).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 7 — Intercalary placement and dayOfYear
// ---------------------------------------------------------------------------

describe('Test 7 — Intercalary placement and dayOfYear', () => {
  const cal = createCalendar(birthrightSpec);

  it('New Year Festival (afterMonthIndex 0) is day 1 of year', () => {
    const nyf = intercalaryDate(0, 0);
    expect(cal.dayOfYear(nyf)).toBe(1);
  });

  it('first day of Month1 is day 2 of year', () => {
    const d = monthDate(0, 1, 1);
    expect(cal.dayOfYear(d)).toBe(2);
  });

  it('Midsummer Silence (afterMonthIndex 6) falls before month 6 in slot order: day 1+5*32+1 = 162', () => {
    // Slot order: NYF (day 1), then for each mi=1..12 emit intercalary then month.
    // At mi=6: Midsummer is emitted BEFORE month 6, so it follows months 1-5.
    // NYF (1) + months 1-5 (5*32=160) + Midsummer = day 162.
    const midsummer = intercalaryDate(0, 1);
    expect(cal.dayOfYear(midsummer)).toBe(1 + 5 * 32 + 1); // 162
  });

  it('last day of year round-trips', () => {
    // Last day of Month12 = year 0.
    const d = monthDate(0, 12, 32);
    const dayN = cal.toEpochDays(d);
    const back = cal.fromEpochDays(dayN);
    expect(back.year).toBe(0);
    if (back.kind === 'month') {
      expect(back.month).toBe(12);
      expect(back.day).toBe(32);
    }
  });

  it('intercalary at year start round-trips', () => {
    const nyf = intercalaryDate(5, 0); // year 5 New Year Festival
    const dayN = cal.toEpochDays(nyf);
    const back = cal.fromEpochDays(dayN);
    expect(back.kind).toBe('intercalary');
    if (back.kind === 'intercalary') {
      expect(back.year).toBe(5);
      expect(back.intercalaryIndex).toBe(0);
    }
  });

  it('intercalary at midsummer round-trips', () => {
    const midsummer = intercalaryDate(3, 1); // year 3 Midsummer Silence
    const dayN = cal.toEpochDays(midsummer);
    const back = cal.fromEpochDays(dayN);
    expect(back.kind).toBe('intercalary');
    if (back.kind === 'intercalary') {
      expect(back.year).toBe(3);
      expect(back.intercalaryIndex).toBe(1);
    }
  });

  it('negative year intercalary round-trips', () => {
    const nyf = intercalaryDate(-2, 0);
    const dayN = cal.toEpochDays(nyf);
    const back = cal.fromEpochDays(dayN);
    expect(back.kind).toBe('intercalary');
    if (back.kind === 'intercalary') {
      expect(back.year).toBe(-2);
      expect(back.intercalaryIndex).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 8 — eraFor, ordinal, resolveLeapRule, registry
// ---------------------------------------------------------------------------

describe('Test 8 — eraFor, ordinal, resolveLeapRule, registry', () => {
  const cal = createCalendar(birthrightSpec);

  // eraFor
  it('eraFor negative year returns the earliest era', () => {
    const era: EraSpec = cal.eraFor(-100);
    expect(era.suffix).toBe('AW');
  });

  it('eraFor year 0 returns Age of Peace', () => {
    const era: EraSpec = cal.eraFor(0);
    expect(era.suffix).toBe('AP');
  });

  it('eraFor year 999 returns Age of Peace (before Age of Stars)', () => {
    const era: EraSpec = cal.eraFor(999);
    expect(era.suffix).toBe('AP');
  });

  it('eraFor year 1000 returns Age of Stars', () => {
    const era: EraSpec = cal.eraFor(1000);
    expect(era.suffix).toBe('AS');
  });

  it('eraFor year 5000 returns Age of Stars', () => {
    const era: EraSpec = cal.eraFor(5000);
    expect(era.suffix).toBe('AS');
  });

  it('Golarion has a single era covering all years including negative', () => {
    const gCal = createCalendar(golarionSpec);
    expect(gCal.eraFor(-999999).suffix).toBe('AR');
    expect(gCal.eraFor(0).suffix).toBe('AR');
    expect(gCal.eraFor(9999).suffix).toBe('AR');
  });

  // ordinal
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [10, '10th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [23, '23rd'],
    [100, '100th'],
    [101, '101st'],
    [111, '111th'],
    [112, '112th'],
  ])('ordinal(%i) === %s', (n, expected) => {
    const gCal = createCalendar(golarionSpec);
    expect(gCal.ordinal(n)).toBe(expected);
  });

  // resolveLeapRule
  it('resolveLeapRule("bogus") returns NO_OP_RULE', () => {
    expect(resolveLeapRule('bogus')).toBe(NO_OP_RULE);
  });

  it('resolveLeapRule("none") returns NO_OP_RULE', () => {
    expect(resolveLeapRule('none')).toBe(NO_OP_RULE);
  });

  it('resolveLeapRule("gregorian") is leap for year 2000', () => {
    const rule = resolveLeapRule('gregorian');
    expect(rule.isLeap(2000)).toBe(true);
    expect(rule.extraDays(2000)).toBe(1);
  });

  // registry
  it('resolveCalendar(GOLARION_ID) returns golarionSpec', () => {
    expect(resolveCalendar(GOLARION_ID).id).toBe(GOLARION_ID);
  });

  it('resolveCalendar(GREGORIAN_ID) returns gregorianSpec', () => {
    expect(resolveCalendar(GREGORIAN_ID).id).toBe(GREGORIAN_ID);
  });

  it('resolveCalendar("unknown") falls back to golarionSpec', () => {
    expect(resolveCalendar('unknown').id).toBe(GOLARION_ID);
  });

  it('resolveCalendar with a custom spec finds it', () => {
    const result = resolveCalendar('brth', [birthrightSpec]);
    expect(result.id).toBe('brth');
  });

  it('getSystemCalendar returns the right spec', () => {
    expect(getSystemCalendar(GOLARION_ID)?.id).toBe(GOLARION_ID);
    expect(getSystemCalendar(GREGORIAN_ID)?.id).toBe(GREGORIAN_ID);
    expect(getSystemCalendar('bogus')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Bonus: validate / tryParse / format
// ---------------------------------------------------------------------------

describe('validate / tryParse / format', () => {
  const cal = createCalendar(golarionSpec);

  it('validate does not throw for a valid date', () => {
    expect(() => cal.validate(monthDate(1, 1, 1))).not.toThrow();
  });

  it('validate throws RangeError for invalid month', () => {
    expect(() => cal.validate(monthDate(1, 0, 1))).toThrow(RangeError);
    expect(() => cal.validate(monthDate(1, 13, 1))).toThrow(RangeError);
  });

  it('validate throws RangeError for day out of range', () => {
    expect(() => cal.validate(monthDate(2023, 2, 29))).toThrow(RangeError); // non-leap
    expect(() => cal.validate(monthDate(2024, 2, 29))).not.toThrow(); // leap year
  });

  it('tryParse returns a valid date for YYYY-MM-DD', () => {
    const d = cal.tryParse('0001-03-15');
    expect(d).not.toBeNull();
    expect(d?.kind).toBe('month');
    if (d?.kind === 'month') {
      expect(d.year).toBe(1);
      expect(d.month).toBe(3);
      expect(d.day).toBe(15);
    }
  });

  it('tryParse returns a valid date with time component', () => {
    const d = cal.tryParse('4726-05-04T12:30:00');
    expect(d).not.toBeNull();
    if (d?.kind === 'month') {
      expect(d.year).toBe(4726);
      expect(d.month).toBe(5);
      expect(d.day).toBe(4);
      expect(d.hour).toBe(12);
      expect(d.minute).toBe(30);
      expect(d.second).toBe(0);
    }
  });

  it('tryParse handles negative year', () => {
    const d = cal.tryParse('-0050-01-01');
    expect(d).not.toBeNull();
    if (d?.kind === 'month') {
      expect(d.year).toBe(-50);
    }
  });

  it('tryParse returns null for garbage input', () => {
    expect(cal.tryParse('not-a-date')).toBeNull();
    expect(cal.tryParse('')).toBeNull();
  });

  it('tryParse returns null for structurally valid but out-of-range date', () => {
    // Calistril has only 28 days in non-leap year.
    expect(cal.tryParse('2023-02-29')).toBeNull();
  });

  it('format produces YYYY-MM-DD for date-only', () => {
    expect(cal.format(monthDate(4726, 5, 4))).toBe('4726-05-04');
  });

  it('format produces YYYY-MM-DDTHH:MM:SS with time', () => {
    expect(cal.format(monthDate(1, 3, 7, 8, 5, 3))).toBe('0001-03-07T08:05:03');
  });

  it('format handles negative year', () => {
    expect(cal.format(monthDate(-50, 1, 1))).toBe('-0050-01-01');
  });

  it('format of intercalary date returns the festival name', () => {
    const brCal = createCalendar(birthrightSpec);
    expect(brCal.format(intercalaryDate(0, 0))).toBe('New Year Festival');
    expect(brCal.format(intercalaryDate(0, 1))).toBe('Midsummer Silence');
  });
});

// ---------------------------------------------------------------------------
// Bonus: Gregorian-specific sanity checks
// ---------------------------------------------------------------------------

describe('Gregorian calendar sanity checks', () => {
  const cal = createCalendar(gregorianSpec);

  it('secondsPerDay is 86400', () => {
    expect(cal.secondsPerDay()).toBe(86400);
  });

  it('February in leap year has 29 days', () => {
    expect(cal.daysInMonth(2000, 2)).toBe(29);
    expect(cal.daysInMonth(2024, 2)).toBe(29);
  });

  it('February in non-leap year has 28 days', () => {
    expect(cal.daysInMonth(2023, 2)).toBe(28);
    expect(cal.daysInMonth(1900, 2)).toBe(28);
  });

  it('epoch round-trips', () => {
    const d = monthDate(0, 1, 1);
    expect(cal.toEpochDays(d)).toBe(0);
    const back = cal.fromEpochDays(0);
    expect(back.year).toBe(0);
    if (back.kind === 'month') {
      expect(back.month).toBe(1);
      expect(back.day).toBe(1);
    }
  });

  it('has 7 weekdays', () => {
    expect(cal.weekLength()).toBe(7);
    expect(cal.weekdayName(0)).toBe('Monday');
    expect(cal.weekdayName(6)).toBe('Sunday');
  });
});
