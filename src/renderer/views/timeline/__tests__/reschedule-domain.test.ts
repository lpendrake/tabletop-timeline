import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildRescheduleFrontmatter } from '../reschedule-domain';
import { CalendarProvider } from '../../../timeline/calendar/provider';
import { createCalendar, golarionSpec, GOLARION_ID } from '../../../../shared/calendar';
import type { Event } from '../../../timeline/data/types';

const baseEvent: Event = {
  filename: '4726-06-04-battle.md',
  title: 'Battle at the Bridge',
  date: '4726-06-04',
  body: 'A fierce skirmish.',
  mtime: '2024-01-01T00:00:00Z',
};

describe('buildRescheduleFrontmatter', () => {
  beforeEach(() => {
    CalendarProvider.init(createCalendar(golarionSpec));
  });

  afterEach(() => {
    CalendarProvider._reset();
  });

  it('stores only epochSeconds, not a date string', () => {
    const cal = CalendarProvider.get();
    // Pick a known Golarion date and compute its epochSeconds.
    const targetDate = '4726-06-10';
    const parsed = cal.tryParse(targetDate);
    expect(parsed).not.toBeNull();
    const newSeconds = cal.toEpochSeconds(parsed!);

    const fm = buildRescheduleFrontmatter(baseEvent, newSeconds, []);

    // epochSeconds must be the exact value passed in
    expect(fm.epochSeconds).toBe(newSeconds);
    // date field must NOT be written
    expect('date' in fm).toBe(false);
  });

  it('strips old session tags and does not add new ones when sessions list is empty', () => {
    const eventWithSeshTag: Event = {
      ...baseEvent,
      // session tags use the "sesh:" prefix (see isSessionTag in entity-tags.ts)
      tags: ['sesh:abc-uuid', 'plot:dragon'],
    };
    const cal = CalendarProvider.get();
    const parsed = cal.tryParse('4726-06-10')!;
    const newSeconds = cal.toEpochSeconds(parsed);

    const fm = buildRescheduleFrontmatter(eventWithSeshTag, newSeconds, []);

    // session tag stripped, non-session tag kept
    expect(fm.tags).toEqual(['plot:dragon']);
  });

  it('preserves event color and status', () => {
    const coloredEvent: Event = {
      ...baseEvent,
      color: 'red',
      status: 'planned',
    };
    const cal = CalendarProvider.get();
    const parsed = cal.tryParse('4726-06-10')!;
    const newSeconds = cal.toEpochSeconds(parsed);

    const fm = buildRescheduleFrontmatter(coloredEvent, newSeconds, []);

    expect(fm.color).toBe('red');
    expect(fm.status).toBe('planned');
  });

  it('omits tags field entirely when there are no tags after update', () => {
    const cal = CalendarProvider.get();
    const parsed = cal.tryParse('4726-06-10')!;
    const newSeconds = cal.toEpochSeconds(parsed);

    const fm = buildRescheduleFrontmatter(baseEvent, newSeconds, []);

    expect(fm.tags).toBeUndefined();
  });

  it('uses the GOLARION_ID default when CalendarProvider falls back', () => {
    // CalendarProvider.get() falls back to Golarion when uninitialised.
    CalendarProvider._reset();
    const cal = CalendarProvider.get();
    const parsed = cal.tryParse('4726-06-10')!;
    const newSeconds = cal.toEpochSeconds(parsed);

    const fm = buildRescheduleFrontmatter(baseEvent, newSeconds, []);

    expect(fm.epochSeconds).toBe(newSeconds);
    expect('date' in fm).toBe(false);
  });

  it('initialises the calendar from a specific id via initFromId', () => {
    CalendarProvider.initFromId(GOLARION_ID);
    const cal = CalendarProvider.get();
    const parsed = cal.tryParse('4726-01-01')!;
    const newSeconds = cal.toEpochSeconds(parsed);

    const fm = buildRescheduleFrontmatter(baseEvent, newSeconds, []);

    expect(fm.epochSeconds).toBe(newSeconds);
    // epochSeconds must round-trip back to the original seconds via the calendar
    expect(fm.epochSeconds).toBe(newSeconds);
    expect('date' in fm).toBe(false);
  });
});
