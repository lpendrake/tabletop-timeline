import { type CalendarDate } from '../../../shared/calendar';
import { CalendarProvider } from './provider';

// ---------------------------------------------------------------------------
// Backward-compat adapter
// ---------------------------------------------------------------------------

/** Shape of the legacy Golarion date object used by existing consumers. */
type LegacyDate = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function toCalendarDate(d: CalendarDate | LegacyDate): CalendarDate {
  return 'kind' in d ? d : { kind: 'month', ...d };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function hhmm(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function hasTime(d: CalendarDate): boolean {
  return d.hour !== 0 || d.minute !== 0 || d.second !== 0;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/** "Wealday, 4th of Desnus, 4726 AR — 18:30" */
export function formatExpanded(date: CalendarDate | LegacyDate): string {
  const cal = CalendarProvider.get();
  const d = toCalendarDate(date);
  const era = cal.eraFor(d.year);

  if (d.kind === 'intercalary') {
    const festName = cal.intercalaryName(d.intercalaryIndex);
    let s = `${festName}, ${d.year} ${era.suffix}`;
    if (hasTime(d)) s += ` — ${hhmm(d.hour, d.minute)}`;
    return s;
  }

  const idx = cal.weekdayIndex(d);
  const wdPart = idx !== null ? `${cal.weekdayName(idx)}, ` : '';
  let s = `${wdPart}${cal.ordinal(d.day)} of ${cal.monthName(d.month)}, ${d.year} ${era.suffix}`;
  if (hasTime(d)) s += ` — ${hhmm(d.hour, d.minute)}`;
  return s;
}

/** "Wea 4 Desnus 4726" */
export function formatCompact(date: CalendarDate | LegacyDate): string {
  const cal = CalendarProvider.get();
  const d = toCalendarDate(date);

  if (d.kind === 'intercalary') {
    return `${cal.intercalaryName(d.intercalaryIndex)} ${d.year}`;
  }

  const idx = cal.weekdayIndex(d);
  const wdPart = idx !== null ? `${cal.weekdayAbbrev(idx)} ` : '';
  return `${wdPart}${d.day} ${cal.monthName(d.month)} ${d.year}`;
}

/** "Wea 4 Desnus 4726" or "Wea 4 Desnus 4726 — 18:30" when time is set */
export function formatCompactWithTime(date: CalendarDate | LegacyDate): string {
  const d = toCalendarDate(date);
  const base = formatCompact(d);
  if (hasTime(d)) {
    return `${base} — ${hhmm(d.hour, d.minute)}`;
  }
  return base;
}

/** "4726, Desnus, 4th (Wea)" or "4726, Desnus, 4th (Wea), 01:30" when time is set */
export function formatCardFace(date: CalendarDate | LegacyDate): string {
  const cal = CalendarProvider.get();
  const d = toCalendarDate(date);

  if (d.kind === 'intercalary') {
    const festName = cal.intercalaryName(d.intercalaryIndex);
    let s = `${d.year}, ${festName}`;
    if (hasTime(d)) s += `, ${hhmm(d.hour, d.minute)}`;
    return s;
  }

  const idx = cal.weekdayIndex(d);
  const wdPart = idx !== null ? ` (${cal.weekdayAbbrev(idx)})` : '';
  let s = `${d.year}, ${cal.monthName(d.month)}, ${cal.ordinal(d.day)}${wdPart}`;
  if (hasTime(d)) s += `, ${hhmm(d.hour, d.minute)}`;
  return s;
}

/** "Wea 4 Desnus" — axis major tick (used by tooltips/labels outside the axis) */
export function formatAxisDay(date: CalendarDate | LegacyDate): string {
  const cal = CalendarProvider.get();
  const d = toCalendarDate(date);

  if (d.kind === 'intercalary') {
    return cal.intercalaryName(d.intercalaryIndex);
  }

  const idx = cal.weekdayIndex(d);
  const wdPart = idx !== null ? `${cal.weekdayAbbrev(idx)} ` : '';
  return `${wdPart}${d.day} ${cal.monthName(d.month)}`;
}

/** "Wea 4" / "4" — axis tick label, detail level driven by zoom */
export function formatAxisDayTick(
  date: CalendarDate | LegacyDate,
  level: 'full' | 'short',
): string {
  const cal = CalendarProvider.get();
  const d = toCalendarDate(date);

  if (level === 'short') {
    if (d.kind === 'intercalary') return cal.intercalaryName(d.intercalaryIndex).slice(0, 3);
    return `${d.day}`;
  }

  if (d.kind === 'intercalary') {
    return cal.intercalaryName(d.intercalaryIndex);
  }

  const idx = cal.weekdayIndex(d);
  const wdPart = idx !== null ? `${cal.weekdayAbbrev(idx)} ` : '';
  return `${wdPart}${d.day}`;
}

/** "09:00" — axis minor tick */
export function formatAxisHour(date: CalendarDate | LegacyDate, shorten: boolean = false): string {
  const d = toCalendarDate(date);
  const hour = String(d.hour).padStart(2, '0');
  if (shorten && d.minute === 0) return hour;
  return `${hour}:${String(d.minute).padStart(2, '0')}`;
}

/** "Desnus 4th, Wealday, 4726 AR" — floating header (day) */
export function formatFloatingDay(date: CalendarDate | LegacyDate): string {
  const cal = CalendarProvider.get();
  const d = toCalendarDate(date);
  const era = cal.eraFor(d.year);

  if (d.kind === 'intercalary') {
    return `${cal.intercalaryName(d.intercalaryIndex)}, ${d.year} ${era.suffix}`;
  }

  const idx = cal.weekdayIndex(d);
  const wdPart = idx !== null ? `, ${cal.weekdayName(idx)}` : '';
  return `${cal.monthName(d.month)} ${cal.ordinal(d.day)}${wdPart}, ${d.year} ${era.suffix}`;
}

/** "Desnus 4726 AR" — floating header (month) */
export function formatFloatingMonth(date: CalendarDate | LegacyDate): string {
  const cal = CalendarProvider.get();
  const d = toCalendarDate(date);
  const era = cal.eraFor(d.year);

  if (d.kind === 'intercalary') {
    return `${cal.intercalaryName(d.intercalaryIndex)} ${d.year} ${era.suffix}`;
  }

  return `${cal.monthName(d.month)} ${d.year} ${era.suffix}`;
}

/** Now-marker label: ["4th of Desnus", "4726 AR"] + optional "15:00" */
export function formatNowMarker(date: CalendarDate | LegacyDate): [string, string, string | null] {
  const cal = CalendarProvider.get();
  const d = toCalendarDate(date);
  const era = cal.eraFor(d.year);
  const yearStr = `${d.year} ${era.suffix}`;
  const time = d.hour !== 0 || d.minute !== 0 ? hhmm(d.hour, d.minute) : null;

  if (d.kind === 'intercalary') {
    return [cal.intercalaryName(d.intercalaryIndex), yearStr, time];
  }

  const dayMonth = `${cal.ordinal(d.day)} of ${cal.monthName(d.month)}`;
  return [dayMonth, yearStr, time];
}
