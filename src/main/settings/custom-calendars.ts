import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CalendarSpec } from '../../shared/calendar/index.js';
import { getSystemCalendar } from '../../shared/calendar/index.js';

const CALENDARS_FILE = 'calendars.json';

function readCalendarsFile(rootDir: string): CalendarSpec[] {
  const file = path.join(rootDir, CALENDARS_FILE);
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as CalendarSpec[];
    }
    return [];
  } catch {
    return [];
  }
}

function writeCalendarsFile(rootDir: string, calendars: CalendarSpec[]): void {
  const file = path.join(rootDir, CALENDARS_FILE);
  fs.writeFileSync(file, JSON.stringify(calendars, null, 2), 'utf-8');
}

export function listCustomCalendars(rootDir: string): CalendarSpec[] {
  return readCalendarsFile(rootDir);
}

export function saveCustomCalendar(rootDir: string, spec: CalendarSpec): void {
  if (getSystemCalendar(spec.id) !== undefined) {
    throw new Error(`Cannot save: "${spec.id}" is a system calendar id.`);
  }
  const calendars = readCalendarsFile(rootDir);
  const index = calendars.findIndex((c) => c.id === spec.id);
  if (index >= 0) {
    calendars[index] = spec;
  } else {
    calendars.push(spec);
  }
  writeCalendarsFile(rootDir, calendars);
}

export function deleteCustomCalendar(rootDir: string, id: string): void {
  if (getSystemCalendar(id) !== undefined) {
    throw new Error(`Cannot delete: "${id}" is a system calendar id.`);
  }
  const calendars = readCalendarsFile(rootDir);
  const filtered = calendars.filter((c) => c.id !== id);
  writeCalendarsFile(rootDir, filtered);
}
