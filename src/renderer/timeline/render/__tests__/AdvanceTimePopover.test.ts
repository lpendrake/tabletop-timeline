import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CalendarProvider } from '../../calendar/provider';
import { formatExpanded } from '../../calendar/format';
import { parseRelativeDelta } from '../AdvanceTimePopover';

beforeEach(() => {
  CalendarProvider._reset();
});
afterEach(() => {
  CalendarProvider._reset();
});

function calParse(iso: string) {
  const cal = CalendarProvider.get();
  const d = cal.tryParse(iso);
  if (!d) throw new Error(`Cannot parse: ${iso}`);
  return d;
}

function calSeconds(iso: string): number {
  const cal = CalendarProvider.get();
  return cal.toEpochSeconds(calParse(iso));
}

function calFromSeconds(secs: number) {
  return CalendarProvider.get().fromEpochSeconds(secs);
}

function calFormat(secs: number): string {
  const cal = CalendarProvider.get();
  return cal.format(calFromSeconds(secs));
}

const BASE_ISO = '4726-05-04T12:00:00';

describe('AdvanceTimePopover — quick delta buttons', () => {
  it('+1 min advances by 60 seconds', () => {
    const base = calSeconds(BASE_ISO);
    const result = calFromSeconds(base + 60);
    expect(result.hour).toBe(12);
    expect(result.minute).toBe(1);
  });

  it('+10 min advances by 600 seconds', () => {
    const base = calSeconds(BASE_ISO);
    const result = calFromSeconds(base + 600);
    expect(result.minute).toBe(10);
  });

  it('+1 hour advances by 3600 seconds', () => {
    const base = calSeconds(BASE_ISO);
    const result = calFromSeconds(base + 3600);
    expect(result.hour).toBe(13);
  });

  it('+1 day advances to the next calendar day', () => {
    const cal = CalendarProvider.get();
    const base = calSeconds(BASE_ISO);
    const result = calFromSeconds(base + cal.secondsPerDay());
    if (result.kind !== 'month') throw new Error('Expected month date');
    expect(result.day).toBe(5);
    expect(result.month).toBe(5);
  });

  it('+1 week advances by weekLength * secondsPerDay', () => {
    const cal = CalendarProvider.get();
    const base = calSeconds(BASE_ISO);
    const delta = cal.weekLength() * cal.secondsPerDay();
    const result = calFromSeconds(base + delta);
    if (result.kind !== 'month') throw new Error('Expected month date');
    // Golarion: 7 days * 86400s = 604800s, so day 4+7=11
    expect(result.day).toBe(11);
    expect(result.month).toBe(5);
  });

  it('applying the same delta twice accumulates (each click adds more)', () => {
    const cal = CalendarProvider.get();
    const base = calSeconds(BASE_ISO);
    const spd = cal.secondsPerDay();
    const after1 = base + spd;
    const after2 = after1 + spd;
    const result = calFromSeconds(after2);
    if (result.kind !== 'month') throw new Error('Expected month date');
    expect(result.day).toBe(6);
  });

  it('delta crossing a month boundary rolls over correctly', () => {
    const cal = CalendarProvider.get();
    const endOfMonth = calSeconds('4726-05-31T12:00:00');
    const result = calFromSeconds(endOfMonth + cal.secondsPerDay());
    if (result.kind !== 'month') throw new Error('Expected month date');
    expect(result.day).toBe(1);
    expect(result.month).toBe(6);
  });
});

describe('parseRelativeDelta', () => {
  it('parses +1h as 3600 seconds', () => {
    expect(parseRelativeDelta('+1h')).toBe(3600);
  });

  it('parses +6h as 21600 seconds', () => {
    expect(parseRelativeDelta('+6h')).toBe(6 * 3600);
  });

  it('parses +1d as secondsPerDay for the active calendar', () => {
    const cal = CalendarProvider.get();
    expect(parseRelativeDelta('+1d')).toBe(cal.secondsPerDay());
  });

  it('parses +1w as weekLength * secondsPerDay for the active calendar', () => {
    const cal = CalendarProvider.get();
    expect(parseRelativeDelta('+1w')).toBe(cal.weekLength() * cal.secondsPerDay());
  });

  it('parses +30m as 1800 seconds', () => {
    expect(parseRelativeDelta('+30m')).toBe(1800);
  });

  it('is case-insensitive for the unit', () => {
    const cal = CalendarProvider.get();
    expect(parseRelativeDelta('+2H')).toBe(2 * 3600);
    expect(parseRelativeDelta('+3D')).toBe(3 * cal.secondsPerDay());
  });

  it('tolerates whitespace inside the expression', () => {
    expect(parseRelativeDelta('+ 5 h')).toBe(5 * 3600);
  });

  it('returns null for an absolute ISO string', () => {
    expect(parseRelativeDelta('4726-05-04T09:30')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseRelativeDelta('')).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(parseRelativeDelta('banana')).toBeNull();
    expect(parseRelativeDelta('+h')).toBeNull();
    expect(parseRelativeDelta('+1')).toBeNull();
  });
});

describe('AdvanceTimePopover — direct ISO input parsing via calendar', () => {
  it('parses a full ISO datetime string', () => {
    const parsed = calParse('4726-06-15T09:30:00');
    expect(parsed.year).toBe(4726);
    expect(parsed.hour).toBe(9);
    expect(parsed.minute).toBe(30);
  });

  it('parses a date-only string (time defaults to 00:00:00)', () => {
    const parsed = calParse('4726-06-15');
    expect(parsed.hour).toBe(0);
    expect(parsed.minute).toBe(0);
  });

  it('returns null for invalid input', () => {
    const cal = CalendarProvider.get();
    expect(cal.tryParse('not-a-date')).toBeNull();
  });

  it('round-trips: format ∘ parse is stable', () => {
    const cal = CalendarProvider.get();
    const iso = calFormat(calSeconds(BASE_ISO));
    expect(iso).toBe(cal.format(cal.tryParse(iso)!));
  });
});

describe('AdvanceTimePopover — display formatting', () => {
  it('includes year, month name and time in expanded format', () => {
    const formatted = formatExpanded(calFromSeconds(calSeconds(BASE_ISO)));
    expect(formatted).toContain('4726');
    expect(formatted).toContain('Desnus');
    expect(formatted).toContain('12:00');
  });

  it('omits time when hour is midnight', () => {
    const midnight = calSeconds('4726-05-04');
    expect(formatExpanded(calFromSeconds(midnight))).not.toContain(':');
  });
});

describe('parseRelativeDelta — +1w advances by weekLength * secondsPerDay', () => {
  it('Golarion default: +1w = 7 * 86400 = 604800', () => {
    const cal = CalendarProvider.get();
    const delta = parseRelativeDelta('+1w');
    expect(delta).toBe(cal.weekLength() * cal.secondsPerDay());
    // Golarion has 7-day weeks and 86400s/day
    expect(delta).toBe(7 * 86400);
  });
});
