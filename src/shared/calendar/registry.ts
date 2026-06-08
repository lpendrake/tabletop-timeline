import { CalendarSpec } from './spec.js';
import { getSystemCalendar, golarionSpec } from './system/index.js';

/**
 * Resolve a CalendarSpec by id.
 *
 * Priority order:
 * 1. System calendars (Golarion, Gregorian, …)
 * 2. Caller-supplied custom specs
 * 3. Golarion (default fallback)
 */
export function resolveCalendar(id: string, customSpecs: CalendarSpec[] = []): CalendarSpec {
  const system = getSystemCalendar(id);
  if (system) return system;

  const custom = customSpecs.find((s) => s.id === id);
  if (custom) return custom;

  return golarionSpec;
}
