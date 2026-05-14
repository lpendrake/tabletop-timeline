/** Golarian calendar — month lengths match Gregorian, same leap rule, seven-day week. */

export interface GolarianDate {
  year: number;
  month: number;   // 1–12
  day: number;     // 1–31
  hour: number;    // 0–23
  minute: number;  // 0–59
  second: number;  // 0–59
}

export const MONTHS = [
  { index: 1,  name: 'Abadius',   days: 31 },
  { index: 2,  name: 'Calistril', days: 28 },
  { index: 3,  name: 'Pharast',   days: 31 },
  { index: 4,  name: 'Gozran',    days: 30 },
  { index: 5,  name: 'Desnus',    days: 31 },
  { index: 6,  name: 'Sarenith',  days: 30 },
  { index: 7,  name: 'Erastus',   days: 31 },
  { index: 8,  name: 'Arodus',    days: 31 },
  { index: 9,  name: 'Rova',      days: 30 },
  { index: 10, name: 'Lamashan',  days: 31 },
  { index: 11, name: 'Neth',      days: 30 },
  { index: 12, name: 'Kuthona',   days: 31 },
] as const;

export const WEEKDAYS = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const;

export type Weekday = typeof WEEKDAYS[number];

// Anchor: 4726-05-04 is Wednesday (index 2)
const ANCHOR_YEAR = 4726;
const ANCHOR_MONTH = 5;
const ANCHOR_DAY = 4;
const ANCHOR_WEEKDAY_INDEX = 2; // Wednesday

export function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) throw new RangeError(`Invalid month: ${month}`);
  if (month === 2 && isLeap(year)) return 29;
  return MONTHS[month - 1].days;
}

export function daysInYear(year: number): number {
  return isLeap(year) ? 366 : 365;
}

export function monthName(month: number): string {
  if (month < 1 || month > 12) throw new RangeError(`Invalid month: ${month}`);
  return MONTHS[month - 1].name;
}

/**
 * Total days from epoch (year 0, Abadius 1) to the start of `date.day`.
 * i.e. epoch day 0 = 0000-01-01.
 */
export function toAbsoluteDays(date: Pick<GolarianDate, 'year' | 'month' | 'day'>): number {
  let days = 0;

  // Complete years
  // For large year ranges, compute using 400-year cycles for efficiency.
  const y = date.year;
  const fullCycles = Math.floor(y / 400);
  days += fullCycles * 146097; // 400 years = 97 leaps = 400*365 + 97
  for (let yr = fullCycles * 400; yr < y; yr++) {
    days += daysInYear(yr);
  }

  // Complete months in the target year
  for (let m = 1; m < date.month; m++) {
    days += daysInMonth(y, m);
  }

  // Days within the month (1-based, so day 1 = 0 additional days)
  days += date.day - 1;

  return days;
}

export function fromAbsoluteDays(totalDays: number): GolarianDate {
  let remaining = totalDays;

  // Estimate year using 400-year cycles
  let year = Math.floor(remaining / 146097) * 400;
  remaining -= Math.floor(year / 400) * 146097;

  while (remaining >= daysInYear(year)) {
    remaining -= daysInYear(year);
    year++;
  }

  let month = 1;
  while (month <= 12 && remaining >= daysInMonth(year, month)) {
    remaining -= daysInMonth(year, month);
    month++;
  }

  return { year, month, day: remaining + 1, hour: 0, minute: 0, second: 0 };
}

export function weekday(date: Pick<GolarianDate, 'year' | 'month' | 'day'>): Weekday {
  const anchorDays = toAbsoluteDays({ year: ANCHOR_YEAR, month: ANCHOR_MONTH, day: ANCHOR_DAY });
  const targetDays = toAbsoluteDays(date);
  const diff = targetDays - anchorDays;
  // JavaScript % can return negative, so normalise
  const mod = ((diff % 7) + 7) % 7;
  return WEEKDAYS[(ANCHOR_WEEKDAY_INDEX + mod) % 7];
}

export function fromAbsoluteSeconds(totalSeconds: number): GolarianDate {
  const days = Math.floor(totalSeconds / 86400);
  const rem = totalSeconds % 86400;
  const base = fromAbsoluteDays(days);
  return {
    ...base,
    hour: Math.floor(rem / 3600),
    minute: Math.floor((rem % 3600) / 60),
    second: rem % 60,
  };
}
