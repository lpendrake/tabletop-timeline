import { CalendarSpec } from '../spec.js';
import { golarionSpec, GOLARION_ID } from './golarion.js';
import { gregorianSpec, GREGORIAN_ID } from './gregorian.js';

export { golarionSpec, GOLARION_ID } from './golarion.js';
export { gregorianSpec, GREGORIAN_ID } from './gregorian.js';

export const SYSTEM_CALENDARS: CalendarSpec[] = [golarionSpec, gregorianSpec];

export function getSystemCalendar(id: string): CalendarSpec | undefined {
  return SYSTEM_CALENDARS.find((s) => s.id === id);
}

// Suppress unused-variable warnings for the re-exported symbols used below.
void GOLARION_ID;
void GREGORIAN_ID;
