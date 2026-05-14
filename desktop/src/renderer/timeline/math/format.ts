import { type GolarianDate, weekday } from './golarian';

/** "Wed 4" / "4" — axis tick label, detail level driven by zoom */
export function formatAxisDayTick(date: GolarianDate, level: 'full' | 'short'): string {
  if (level === 'short') return `${date.day}`;
  return `${weekday(date).slice(0, 3)} ${date.day}`;
}

/** "09:00" — axis minor tick */
export function formatAxisHour(date: GolarianDate, shorten: boolean = false): string {
  const hour = String(date.hour).padStart(2, '0');
  if (shorten && date.minute === 0) return hour;
  return `${hour}:${String(date.minute).padStart(2, '0')}`;
}
