interface DateTimeFields {
  year: number;
  hour: number;
  minute: number;
  second: number;
}

export interface MonthDate extends DateTimeFields {
  kind: 'month';
  /** 1-based month index. */
  month: number;
  /** 1-based day within the month. */
  day: number;
}

export interface IntercalaryDate extends DateTimeFields {
  kind: 'intercalary';
  /** Index into CalendarSpec.intercalary[]. */
  intercalaryIndex: number;
}

export type CalendarDate = MonthDate | IntercalaryDate;
