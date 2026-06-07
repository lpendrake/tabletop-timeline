import { CalendarSpec } from '../spec.js';

export const GREGORIAN_ID = 'greg';

/**
 * Gregorian calendar.
 *
 * Standard 12-month structure with the 4/100/400 leap rule (February absorbs
 * the extra day). epochWeekdayIndex is 0 — internally consistent but not
 * calibrated to match any real-world day of the week.
 */
export const gregorianSpec: CalendarSpec = {
  id: GREGORIAN_ID,
  name: 'Gregorian',
  kind: 'system',
  time: { hoursPerDay: 24, minutesPerHour: 60, secondsPerMinute: 60 },
  months: [
    { name: 'January', abbrev: 'Jan', length: 31 },
    { name: 'February', abbrev: 'Feb', length: 28 }, // absorbing month (index 1)
    { name: 'March', abbrev: 'Mar', length: 31 },
    { name: 'April', abbrev: 'Apr', length: 30 },
    { name: 'May', abbrev: 'May', length: 31 },
    { name: 'June', abbrev: 'Jun', length: 30 },
    { name: 'July', abbrev: 'Jul', length: 31 },
    { name: 'August', abbrev: 'Aug', length: 31 },
    { name: 'September', abbrev: 'Sep', length: 30 },
    { name: 'October', abbrev: 'Oct', length: 31 },
    { name: 'November', abbrev: 'Nov', length: 30 },
    { name: 'December', abbrev: 'Dec', length: 31 },
  ],
  week: {
    days: [
      { name: 'Monday', abbrev: 'Mon' },
      { name: 'Tuesday', abbrev: 'Tue' },
      { name: 'Wednesday', abbrev: 'Wed' },
      { name: 'Thursday', abbrev: 'Thu' },
      { name: 'Friday', abbrev: 'Fri' },
      { name: 'Saturday', abbrev: 'Sat' },
      { name: 'Sunday', abbrev: 'Sun' },
    ],
    epochWeekdayIndex: 0,
  },
  intercalary: [],
  eras: [{ name: 'Common Era', suffix: 'CE', startYear: -1000000 }],
  leap: { ruleId: 'gregorian', absorbingMonthIndex: 1 },
};
