import { CalendarSpec, EraSpec } from './spec.js';
import { CalendarDate, MonthDate } from './date.js';
import { LeapRule, resolveLeapRule } from './leap-rules.js';

// ---------------------------------------------------------------------------
// Slot — a unit in the ordered year layout
// ---------------------------------------------------------------------------

/** A single intercalary slot (one festival day). */
interface IntercalarySlot {
  kind: 'intercalary';
  intercalaryIndex: number;
}

/** A contiguous run of days belonging to one month. */
interface MonthSlot {
  kind: 'month';
  monthIndex: number; // 0-based index into spec.months
}

type Slot = IntercalarySlot | MonthSlot;

// ---------------------------------------------------------------------------
// Calendar interface
// ---------------------------------------------------------------------------

export interface Calendar {
  // instant ↔ date
  fromEpochSeconds(s: number): CalendarDate;
  toEpochSeconds(d: CalendarDate): number;
  fromEpochDays(n: number): CalendarDate;
  toEpochDays(d: CalendarDate): number;

  // structure
  secondsPerDay(): number;
  daysInMonth(year: number, month: number): number;
  daysInYear(year: number): number;
  dayOfYear(d: CalendarDate): number;
  isLeapYear(year: number): boolean;
  monthCount(): number;
  weekLength(): number;
  weekdayIndex(d: CalendarDate): number | null;

  // labels
  monthName(month: number): string;
  monthAbbrev(month: number): string;
  weekdayName(i: number): string;
  weekdayAbbrev(i: number): string;
  intercalaryName(i: number): string;
  eraFor(year: number): EraSpec;
  ordinal(n: number): string;

  // validation / parse / format
  validate(d: CalendarDate): void;
  tryParse(text: string): CalendarDate | null;
  format(d: CalendarDate): string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCalendar(spec: CalendarSpec): Calendar {
  const rule: LeapRule = resolveLeapRule(spec.leap.ruleId);
  const spd = spec.time.hoursPerDay * spec.time.minutesPerHour * spec.time.secondsPerMinute;

  // Sorted eras ascending by startYear (defensive copy).
  const sortedEras = [...spec.eras].sort((a, b) => a.startYear - b.startYear);

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Build the ordered slot list for a year.
   * Order: for monthIndex 0..months.length, first emit intercalary days with
   * afterMonthIndex === monthIndex (sorted by order??0 ascending), then (if
   * monthIndex >= 1) emit the month slot.
   */
  function buildSlots(year: number): Slot[] {
    const slots: Slot[] = [];
    const numMonths = spec.months.length;

    for (let mi = 0; mi <= numMonths; mi++) {
      // Intercalary days inserted before month (mi+1) — i.e. afterMonthIndex === mi
      const intercalaries = spec.intercalary
        .map((iday, idx) => ({ iday, idx }))
        .filter(({ iday }) => iday.afterMonthIndex === mi)
        .sort((a, b) => (a.iday.order ?? 0) - (b.iday.order ?? 0));

      for (const { idx } of intercalaries) {
        slots.push({ kind: 'intercalary', intercalaryIndex: idx });
      }

      if (mi >= 1) {
        slots.push({ kind: 'month', monthIndex: mi - 1 });
      }
    }

    // Suppress unused-variable warning — year is needed by callers who compute
    // daysInMonth, but the slot structure itself is year-independent.
    void year;

    return slots;
  }

  function daysInMonthImpl(year: number, month: number): number {
    if (month < 1 || month > spec.months.length) {
      throw new RangeError(`Month ${month} out of range [1, ${spec.months.length}]`);
    }
    const monthIdx = month - 1; // 0-based
    const base = spec.months[monthIdx].length;
    const isAbsorbing = spec.leap.ruleId !== 'none' && spec.leap.absorbingMonthIndex === monthIdx;
    return isAbsorbing ? base + rule.extraDays(year) : base;
  }

  function daysInYearImpl(year: number): number {
    let total = 0;
    for (let m = 1; m <= spec.months.length; m++) {
      total += daysInMonthImpl(year, m);
    }
    // Intercalary days are fixed (not leap-dependent).
    total += spec.intercalary.length;
    return total;
  }

  // ---------------------------------------------------------------------------
  // Efficient whole-year sums using the leap rule's period when available.
  // Returns the total number of days in years [0, year) — note: handles
  // negative years by going backwards from 0.
  // ---------------------------------------------------------------------------

  /** Fixed (non-leap) days in one year (before any leap additions). */
  function fixedYearDays(): number {
    let total = 0;
    for (const m of spec.months) total += m.length;
    total += spec.intercalary.length;
    return total;
  }

  /**
   * Number of extra (leap) days in one period of `rule.period` years starting
   * at year `startYear` (mod period === 0 assumed for Gregorian correctness).
   */
  function extraDaysInPeriod(): number {
    if (!rule.period) return 0;
    let extra = 0;
    for (let i = 0; i < rule.period; i++) extra += rule.extraDays(i);
    return extra;
  }

  const _fixed = fixedYearDays();

  /**
   * Sum of daysInYear for years [from, to).
   * Uses O(1) cycle arithmetic when rule.period is set; otherwise O(n) year walk.
   */
  function sumYearDays(from: number, to: number): number {
    if (from >= to) return 0;
    const count = to - from;

    if (rule.period && rule.period > 0) {
      // Gregorian-style: use full cycle blocks + remainder walk.
      // We need extra days in [from, to) correctly.
      // Strategy: walk to a cycle boundary, then fast-forward full cycles.
      const cycleDays = rule.period * _fixed + extraDaysInPeriod();

      // Align to a period boundary >= from.
      const alignedStart = Math.ceil(from / rule.period) * rule.period;

      if (alignedStart >= to) {
        // Range is entirely within one partial cycle — year walk.
        let total = count * _fixed;
        for (let y = from; y < to; y++) total += rule.extraDays(y);
        return total;
      }

      // Days from [from, alignedStart)
      let total = 0;
      for (let y = from; y < alignedStart; y++) total += _fixed + rule.extraDays(y);

      // Full cycles
      const alignedEnd = Math.floor(to / rule.period) * rule.period;
      const fullCycles = (alignedEnd - alignedStart) / rule.period;
      total += fullCycles * cycleDays;

      // Remaining [alignedEnd, to)
      for (let y = alignedEnd; y < to; y++) total += _fixed + rule.extraDays(y);

      return total;
    }

    // No period — linear walk (fine for simple calendars like 'none').
    return count * _fixed;
  }

  // ---------------------------------------------------------------------------
  // Day layer
  // ---------------------------------------------------------------------------

  function toEpochDaysImpl(d: CalendarDate): number {
    const year = d.year;

    // Sum all complete years [0, year) (handles negative via sumYearDays).
    let days = 0;
    if (year >= 0) {
      days = sumYearDays(0, year);
    } else {
      // Negative year: we subtract days going back from year 0.
      days = -sumYearDays(year, 0);
    }

    // Now walk the slots of the target year.
    const slots = buildSlots(year);
    let dayInYear = 0;

    if (d.kind === 'intercalary') {
      // Advance through slots until we hit this intercalary slot.
      for (const slot of slots) {
        if (slot.kind === 'intercalary' && slot.intercalaryIndex === d.intercalaryIndex) {
          break;
        }
        if (slot.kind === 'intercalary') {
          dayInYear += 1;
        } else {
          dayInYear += daysInMonthImpl(year, slot.monthIndex + 1);
        }
      }
      // The intercalary day itself is a single day.
      days += dayInYear;
    } else {
      // Month date.
      const targetMonth = d.month; // 1-based
      const targetDay = d.day; // 1-based

      for (const slot of slots) {
        if (slot.kind === 'month' && slot.monthIndex === targetMonth - 1) {
          // Reached the target month.
          dayInYear += targetDay - 1;
          break;
        }
        if (slot.kind === 'intercalary') {
          dayInYear += 1;
        } else {
          dayInYear += daysInMonthImpl(year, slot.monthIndex + 1);
        }
      }
      days += dayInYear;
    }

    return days;
  }

  function fromEpochDaysImpl(totalDays: number): CalendarDate {
    let remaining = totalDays;
    let year = 0;

    if (remaining >= 0) {
      // Fast-forward using cycle arithmetic if available.
      if (rule.period && rule.period > 0) {
        const cycleDays = rule.period * _fixed + extraDaysInPeriod();
        if (cycleDays > 0) {
          const fullCycles = Math.floor(remaining / cycleDays);
          year += fullCycles * rule.period;
          remaining -= fullCycles * cycleDays;
        }
      }
      // Walk year by year.
      while (remaining >= daysInYearImpl(year)) {
        remaining -= daysInYearImpl(year);
        year++;
      }
    } else {
      // Pre-epoch: walk backwards.
      while (remaining < 0) {
        year--;
        remaining += daysInYearImpl(year);
      }
    }

    // Now `remaining` is a 0-based offset within `year`.
    const slots = buildSlots(year);
    for (const slot of slots) {
      if (slot.kind === 'intercalary') {
        if (remaining === 0) {
          return {
            kind: 'intercalary',
            intercalaryIndex: slot.intercalaryIndex,
            year,
            hour: 0,
            minute: 0,
            second: 0,
          };
        }
        remaining -= 1;
      } else {
        const mDays = daysInMonthImpl(year, slot.monthIndex + 1);
        if (remaining < mDays) {
          return {
            kind: 'month',
            month: slot.monthIndex + 1,
            day: remaining + 1,
            year,
            hour: 0,
            minute: 0,
            second: 0,
          };
        }
        remaining -= mDays;
      }
    }

    // Should never reach here for valid input.
    throw new Error(`fromEpochDays: could not resolve day ${totalDays}`);
  }

  // ---------------------------------------------------------------------------
  // Seconds layer
  // ---------------------------------------------------------------------------

  function toEpochSecondsImpl(d: CalendarDate): number {
    const dayNum = toEpochDaysImpl(d);
    return (
      dayNum * spd +
      d.hour * spec.time.minutesPerHour * spec.time.secondsPerMinute +
      d.minute * spec.time.secondsPerMinute +
      d.second
    );
  }

  function fromEpochSecondsImpl(totalSeconds: number): CalendarDate {
    const dayNum = Math.floor(totalSeconds / spd);
    // Normalise remainder to [0, spd) even for negative dividends.
    const rem = ((totalSeconds % spd) + spd) % spd;
    const base = fromEpochDaysImpl(dayNum);
    const h = Math.floor(rem / (spec.time.minutesPerHour * spec.time.secondsPerMinute));
    const leftover = rem % (spec.time.minutesPerHour * spec.time.secondsPerMinute);
    const m = Math.floor(leftover / spec.time.secondsPerMinute);
    const s = leftover % spec.time.secondsPerMinute;
    return { ...base, hour: h, minute: m, second: s };
  }

  // ---------------------------------------------------------------------------
  // Weekday
  // ---------------------------------------------------------------------------

  /**
   * Count of intercalary days that do NOT participate in the week cycle,
   * from the absolute start of time up to (but not including) day `epochDay`.
   *
   * Because non-participating intercalary days can appear at any position
   * in any year, we have to accumulate them by walking years. For the common
   * case of zero intercalary days (Golarion, Gregorian) this is O(1).
   */
  function nonParticipatingBeforeDay(epochDay: number): number {
    if (spec.intercalary.length === 0) return 0;
    const nonParticipating = spec.intercalary.filter((i) => !i.participatesInWeek);
    if (nonParticipating.length === 0) return 0;

    let count = 0;
    // Determine the year of epochDay so we know where to stop.
    const target = fromEpochDaysImpl(epochDay);
    const targetYear = target.year;

    if (targetYear >= 0) {
      // Count non-participating intercalary days in years [0, targetYear).
      for (let y = 0; y < targetYear; y++) {
        count += nonParticipating.length; // each year has the same intercalary set
      }
    } else {
      // Pre-epoch: count for years [targetYear, 0).
      count = -targetYear * nonParticipating.length;
    }

    // Now handle the partial year up to epochDay.
    const slots = buildSlots(targetYear);
    const yearStart = toEpochDaysImpl({
      kind: 'month',
      month: 1,
      day: 1,
      year: targetYear,
      hour: 0,
      minute: 0,
      second: 0,
    } as MonthDate);

    // Walk slots of targetYear until we've consumed `epochDay - yearStart` days.
    let rem = epochDay - yearStart;
    for (const slot of slots) {
      if (rem <= 0) break;
      if (slot.kind === 'intercalary') {
        const iday = spec.intercalary[slot.intercalaryIndex];
        if (!iday.participatesInWeek) count++;
        rem--;
      } else {
        const mDays = daysInMonthImpl(targetYear, slot.monthIndex + 1);
        rem -= mDays;
      }
    }

    return count;
  }

  function weekdayIndexImpl(d: CalendarDate): number | null {
    if (d.kind === 'intercalary') {
      const iday = spec.intercalary[d.intercalaryIndex];
      if (!iday.participatesInWeek) return null;
    }

    const epochDay = toEpochDaysImpl(d);
    const weekLen = spec.week.days.length;
    const nonPart = nonParticipatingBeforeDay(epochDay);
    const elapsed = epochDay - nonPart;
    return (((spec.week.epochWeekdayIndex + elapsed) % weekLen) + weekLen) % weekLen;
  }

  // ---------------------------------------------------------------------------
  // dayOfYear
  // ---------------------------------------------------------------------------

  function dayOfYearImpl(d: CalendarDate): number {
    const year = d.year;
    const slots = buildSlots(year);
    let pos = 1;

    for (const slot of slots) {
      if (slot.kind === 'intercalary') {
        if (d.kind === 'intercalary' && slot.intercalaryIndex === d.intercalaryIndex) {
          return pos;
        }
        pos++;
      } else {
        const mDays = daysInMonthImpl(year, slot.monthIndex + 1);
        if (d.kind === 'month' && slot.monthIndex === d.month - 1) {
          return pos + d.day - 1;
        }
        pos += mDays;
      }
    }

    throw new RangeError('dayOfYear: date not found in year slot list');
  }

  // ---------------------------------------------------------------------------
  // eraFor
  // ---------------------------------------------------------------------------

  function eraForImpl(year: number): EraSpec {
    if (sortedEras.length === 0) throw new Error('CalendarSpec has no eras');
    // Pick the last era whose startYear <= year.
    let best = sortedEras[0];
    for (const era of sortedEras) {
      if (era.startYear <= year) best = era;
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // ordinal
  // ---------------------------------------------------------------------------

  function ordinalImpl(n: number): string {
    const abs = Math.abs(n);
    const mod100 = abs % 100;
    const mod10 = abs % 10;
    if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
    if (mod10 === 1) return `${n}st`;
    if (mod10 === 2) return `${n}nd`;
    if (mod10 === 3) return `${n}rd`;
    return `${n}th`;
  }

  // ---------------------------------------------------------------------------
  // validate
  // ---------------------------------------------------------------------------

  function validateImpl(d: CalendarDate): void {
    if (d.hour < 0 || d.hour >= spec.time.hoursPerDay) {
      throw new RangeError(`Hour ${d.hour} out of range [0, ${spec.time.hoursPerDay - 1}]`);
    }
    if (d.minute < 0 || d.minute >= spec.time.minutesPerHour) {
      throw new RangeError(`Minute ${d.minute} out of range [0, ${spec.time.minutesPerHour - 1}]`);
    }
    if (d.second < 0 || d.second >= spec.time.secondsPerMinute) {
      throw new RangeError(
        `Second ${d.second} out of range [0, ${spec.time.secondsPerMinute - 1}]`,
      );
    }

    if (d.kind === 'intercalary') {
      if (d.intercalaryIndex < 0 || d.intercalaryIndex >= spec.intercalary.length) {
        throw new RangeError(
          `Intercalary index ${d.intercalaryIndex} out of range [0, ${spec.intercalary.length - 1}]`,
        );
      }
    } else {
      if (d.month < 1 || d.month > spec.months.length) {
        throw new RangeError(`Month ${d.month} out of range [1, ${spec.months.length}]`);
      }
      const maxDay = daysInMonthImpl(d.year, d.month);
      if (d.day < 1 || d.day > maxDay) {
        throw new RangeError(
          `Day ${d.day} out of range [1, ${maxDay}] for month ${d.month} year ${d.year}`,
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // parse / format (delegated to parse.ts at call-site; here we keep a local
  // implementation so Calendar is self-contained)
  // ---------------------------------------------------------------------------

  function tryParseImpl(text: string): CalendarDate | null {
    const match = text.match(
      /^(-?\d{4,})-(\d{2})-(\d{2})(?:T(\d{2})(?::(\d{2})(?::(\d{2})(?:\.\d+)?)?)?Z?)?$/,
    );
    if (!match) return null;

    const d: MonthDate = {
      kind: 'month',
      year: parseInt(match[1], 10),
      month: parseInt(match[2], 10),
      day: parseInt(match[3], 10),
      hour: match[4] ? parseInt(match[4], 10) : 0,
      minute: match[5] ? parseInt(match[5], 10) : 0,
      second: match[6] ? parseInt(match[6], 10) : 0,
    };

    try {
      validateImpl(d);
    } catch {
      return null;
    }

    return d;
  }

  function formatImpl(d: CalendarDate): string {
    if (d.kind === 'intercalary') {
      return spec.intercalary[d.intercalaryIndex]?.name ?? `intercalary:${d.intercalaryIndex}`;
    }

    const absYear = Math.abs(d.year);
    const y = (d.year < 0 ? '-' : '') + String(absYear).padStart(4, '0');
    const mo = String(d.month).padStart(2, '0');
    const dy = String(d.day).padStart(2, '0');

    if (d.hour === 0 && d.minute === 0 && d.second === 0) {
      return `${y}-${mo}-${dy}`;
    }

    const hh = String(d.hour).padStart(2, '0');
    const mm = String(d.minute).padStart(2, '0');
    const ss = String(d.second).padStart(2, '0');
    return `${y}-${mo}-${dy}T${hh}:${mm}:${ss}`;
  }

  // ---------------------------------------------------------------------------
  // Public Calendar object
  // ---------------------------------------------------------------------------

  return {
    fromEpochSeconds: fromEpochSecondsImpl,
    toEpochSeconds: toEpochSecondsImpl,
    fromEpochDays: fromEpochDaysImpl,
    toEpochDays: toEpochDaysImpl,

    secondsPerDay: () => spd,
    daysInMonth: daysInMonthImpl,
    daysInYear: daysInYearImpl,
    dayOfYear: dayOfYearImpl,
    isLeapYear: (year: number) => rule.isLeap(year),
    monthCount: () => spec.months.length,
    weekLength: () => spec.week.days.length,
    weekdayIndex: weekdayIndexImpl,

    monthName: (month: number) => {
      if (month < 1 || month > spec.months.length)
        throw new RangeError(`Month ${month} out of range`);
      return spec.months[month - 1].name;
    },
    monthAbbrev: (month: number) => {
      if (month < 1 || month > spec.months.length)
        throw new RangeError(`Month ${month} out of range`);
      return spec.months[month - 1].abbrev;
    },
    weekdayName: (i: number) => {
      if (i < 0 || i >= spec.week.days.length)
        throw new RangeError(`Weekday index ${i} out of range`);
      return spec.week.days[i].name;
    },
    weekdayAbbrev: (i: number) => {
      if (i < 0 || i >= spec.week.days.length)
        throw new RangeError(`Weekday index ${i} out of range`);
      return spec.week.days[i].abbrev;
    },
    intercalaryName: (i: number) => {
      if (i < 0 || i >= spec.intercalary.length)
        throw new RangeError(`Intercalary index ${i} out of range`);
      return spec.intercalary[i].name;
    },
    eraFor: eraForImpl,
    ordinal: ordinalImpl,

    validate: validateImpl,
    tryParse: tryParseImpl,
    format: formatImpl,
  };
}
