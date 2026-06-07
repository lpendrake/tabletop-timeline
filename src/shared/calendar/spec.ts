export interface TimeSpec {
  hoursPerDay: number;
  minutesPerHour: number;
  secondsPerMinute: number;
}

export interface MonthSpec {
  name: string;
  abbrev: string;
  /** Base length in days; absorbing month gains extra days in leap years. */
  length: number;
}

export interface WeekdaySpec {
  name: string;
  abbrev: string;
}

export interface WeekSpec {
  days: WeekdaySpec[];
  /** The weekday index that epoch day 0 lands on. */
  epochWeekdayIndex: number;
}

export interface IntercalaryDaySpec {
  name: string;
  abbrev?: string;
  /**
   * 0 = before month 1 (year start);
   * M = between month M and M+1;
   * months.length = after last month (year end).
   */
  afterMonthIndex: number;
  /** Disambiguates multiple intercalary days sharing the same afterMonthIndex. */
  order?: number;
  /** If false, the weekday cycle pauses across this day (it does not advance the weekday counter). */
  participatesInWeek: boolean;
}

export interface EraSpec {
  name: string;
  suffix: string;
  /** The calendar year this era begins; may be negative. */
  startYear: number;
}

export interface LeapRuleRef {
  /** The ID of the leap rule to apply (use 'none' for no leap years). */
  ruleId: string;
  /**
   * Index into months[] of the month that absorbs the extra day(s).
   * Ignored when ruleId === 'none'.
   */
  absorbingMonthIndex?: number;
}

export interface CalendarSpec {
  /** 4-char reserved id for system calendars; [a-z0-9]{4} for custom. */
  id: string;
  name: string;
  kind: 'system' | 'custom';
  time: TimeSpec;
  months: MonthSpec[];
  week: WeekSpec;
  intercalary: IntercalaryDaySpec[];
  eras: EraSpec[];
  leap: LeapRuleRef;
}
