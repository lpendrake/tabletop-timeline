import { CalendarSpec } from '../spec.js';

export const GOLARION_ID = 'glrn';

/**
 * Golarion calendar (Pathfinder / Absalom Reckoning).
 *
 * Month lengths and leap rule match the Gregorian calendar (Calistril absorbs
 * the extra day in leap years). Weekday names are proper Pathfinder names, NOT
 * the real-world Gregorian weekdays.
 *
 * epochWeekdayIndex = 6 — computed so that 4726-05-04 AR yields weekday index
 * 2 (Wealday), which is the canonical anchor used by golarian.ts.
 * One-off derivation: ((2 - toAbsoluteDays(4726,5,4)) % 7 + 7) % 7 === 6.
 */
export const golarionSpec: CalendarSpec = {
  id: GOLARION_ID,
  name: 'Golarion (Absalom Reckoning)',
  kind: 'system',
  time: { hoursPerDay: 24, minutesPerHour: 60, secondsPerMinute: 60 },
  months: [
    { name: 'Abadius', abbrev: 'Aba', length: 31 },
    { name: 'Calistril', abbrev: 'Cal', length: 28 }, // absorbing month (index 1)
    { name: 'Pharast', abbrev: 'Pha', length: 31 },
    { name: 'Gozran', abbrev: 'Goz', length: 30 },
    { name: 'Desnus', abbrev: 'Des', length: 31 },
    { name: 'Sarenith', abbrev: 'Sar', length: 30 },
    { name: 'Erastus', abbrev: 'Era', length: 31 },
    { name: 'Arodus', abbrev: 'Aro', length: 31 },
    { name: 'Rova', abbrev: 'Rov', length: 30 },
    { name: 'Lamashan', abbrev: 'Lam', length: 31 },
    { name: 'Neth', abbrev: 'Net', length: 30 },
    { name: 'Kuthona', abbrev: 'Kut', length: 31 },
  ],
  week: {
    days: [
      { name: 'Moonday', abbrev: 'Moo' },
      { name: 'Toilday', abbrev: 'Toi' },
      { name: 'Wealday', abbrev: 'Wea' },
      { name: 'Oathday', abbrev: 'Oat' },
      { name: 'Fireday', abbrev: 'Fir' },
      { name: 'Starday', abbrev: 'Sta' },
      { name: 'Sunday', abbrev: 'Sun' },
    ],
    epochWeekdayIndex: 6,
  },
  intercalary: [],
  eras: [{ name: 'Absalom Reckoning', suffix: 'AR', startYear: -1000000 }],
  leap: { ruleId: 'gregorian', absorbingMonthIndex: 1 },
};
