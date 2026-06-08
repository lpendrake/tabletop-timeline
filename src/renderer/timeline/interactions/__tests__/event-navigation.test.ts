import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { findAdjacentEvent } from '../event-navigation';
import { EventListItem } from '../../data/types';
import { CalendarProvider } from '../../calendar/provider';
import { createCalendar, golarionSpec } from '../../../../shared/calendar';

// Ensure the calendar provider is initialised with Golarion for all tests
beforeEach(() => {
  CalendarProvider.init(createCalendar(golarionSpec));
});

afterEach(() => {
  CalendarProvider._reset();
});

const cal = () => CalendarProvider.get();

function makeEvent(filename: string, date: string, epochSeconds?: number): EventListItem {
  return {
    filename,
    date,
    title: filename,
    mtime: '2024-01-01T00:00:00Z',
    ...(epochSeconds !== undefined ? { epochSeconds } : {}),
  };
}

function secondsOf(date: string): number {
  const d = cal().tryParse(date);
  if (!d) throw new Error(`Cannot parse ${date}`);
  return cal().toEpochSeconds(d);
}

// Fixture events with legacy `date` only (no epochSeconds)
const EVENT_A = makeEvent('event-a.md', '4726-01-01');
const EVENT_B = makeEvent('event-b.md', '4726-03-15');
const EVENT_C = makeEvent('event-c.md', '4726-06-01');

const FIXTURE = [EVENT_C, EVENT_A, EVENT_B]; // deliberately unsorted

describe('findAdjacentEvent — legacy date strings', () => {
  it('next from a focused event returns the following event', () => {
    const result = findAdjacentEvent(FIXTURE, 0, 'event-b.md', 'next');
    expect(result).toEqual({ filename: 'event-c.md', seconds: secondsOf('4726-06-01') });
  });

  it('prev from a focused event returns the preceding event', () => {
    const result = findAdjacentEvent(FIXTURE, 0, 'event-b.md', 'prev');
    expect(result).toEqual({ filename: 'event-a.md', seconds: secondsOf('4726-01-01') });
  });

  it('next from a bare reference time returns the first event after it', () => {
    const ref = secondsOf('4726-02-01');
    const result = findAdjacentEvent(FIXTURE, ref, null, 'next');
    expect(result).toEqual({ filename: 'event-b.md', seconds: secondsOf('4726-03-15') });
  });

  it('next at the last event returns null (no wrap)', () => {
    const result = findAdjacentEvent(FIXTURE, 0, 'event-c.md', 'next');
    expect(result).toBeNull();
  });

  it('empty event list returns null', () => {
    const result = findAdjacentEvent([], 0, null, 'next');
    expect(result).toBeNull();
  });
});

describe('findAdjacentEvent — epochSeconds field', () => {
  it('orders correctly when events carry epochSeconds (no date parsing needed)', () => {
    const secA = secondsOf('4726-01-01');
    const secB = secondsOf('4726-03-15');
    const secC = secondsOf('4726-06-01');

    const evA = makeEvent('event-a.md', '4726-01-01', secA);
    const evB = makeEvent('event-b.md', '4726-03-15', secB);
    const evC = makeEvent('event-c.md', '4726-06-01', secC);

    // Deliberately unsorted input
    const result = findAdjacentEvent([evC, evA, evB], 0, 'event-b.md', 'next');
    expect(result).toEqual({ filename: 'event-c.md', seconds: secC });
  });

  it('epochSeconds takes precedence over date string for sorting', () => {
    // Give events epochSeconds that differ from what their date strings would parse to
    const secA = secondsOf('4726-01-01');
    const secB = secondsOf('4726-03-15');
    const secC = secondsOf('4726-06-01');

    // evA has a date of 4726-06-01 but epochSeconds of 4726-01-01 — epochSeconds wins
    const evA = makeEvent('event-a.md', '4726-06-01', secA);
    const evB = makeEvent('event-b.md', '4726-01-01', secB);
    const evC = makeEvent('event-c.md', '4726-03-15', secC);

    // Sorted by epochSeconds: A < B < C
    const result = findAdjacentEvent([evA, evB, evC], 0, 'event-b.md', 'next');
    expect(result).toEqual({ filename: 'event-c.md', seconds: secC });
  });

  it('falls back to parsing date when epochSeconds is absent', () => {
    // evA has no epochSeconds — must fall back to date parsing
    const evA = makeEvent('event-a.md', '4726-01-01'); // no epochSeconds
    const evB = makeEvent('event-b.md', '4726-06-01', secondsOf('4726-06-01'));

    const result = findAdjacentEvent([evA, evB], 0, 'event-a.md', 'next');
    expect(result).toEqual({ filename: 'event-b.md', seconds: secondsOf('4726-06-01') });
  });
});
