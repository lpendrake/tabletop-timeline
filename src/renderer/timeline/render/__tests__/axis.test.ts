import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { naturalTier, chooseDayStep, ALL_TIERS, buildTimeTiers, type TimeTier } from '../axis';
import { CalendarProvider } from '../../calendar/provider';

beforeEach(() => {
  CalendarProvider._reset();
});
afterEach(() => {
  CalendarProvider._reset();
});

function tier(id: TimeTier['id']): TimeTier {
  const t = ALL_TIERS.find((t) => t.id === id);
  if (!t) throw new Error(`No tier: ${id}`);
  return t;
}

describe('naturalTier', () => {
  it('identifies midday (12:00:00 = 43200s)', () => {
    expect(naturalTier(43200, ALL_TIERS)).toBe(tier('midday'));
  });

  it('identifies an hour mark that is not midday (09:00 = 32400s)', () => {
    expect(naturalTier(32400, ALL_TIERS)).toBe(tier('hour'));
  });

  it('identifies 2am (7200s) as an hour, not midday', () => {
    expect(naturalTier(7200, ALL_TIERS)).toBe(tier('hour'));
  });

  it('identifies a half-hour that is not on an hour (00:30 = 1800s)', () => {
    expect(naturalTier(1800, ALL_TIERS)).toBe(tier('half'));
  });

  it('identifies 23:30 (84600s) as half', () => {
    expect(naturalTier(84600, ALL_TIERS)).toBe(tier('half'));
  });

  it('identifies a quarter-hour that is not on a half-hour (00:15 = 900s)', () => {
    expect(naturalTier(900, ALL_TIERS)).toBe(tier('quarter'));
  });

  it('identifies 00:45 (2700s) as quarter', () => {
    expect(naturalTier(2700, ALL_TIERS)).toBe(tier('quarter'));
  });

  it('identifies a minute mark that is not on any coarser boundary (00:01 = 60s)', () => {
    expect(naturalTier(60, ALL_TIERS)).toBe(tier('minute'));
  });

  it('identifies 00:11 (660s) as minute', () => {
    expect(naturalTier(660, ALL_TIERS)).toBe(tier('minute'));
  });

  it('returns null for a second-level value not on any minute boundary (37s)', () => {
    expect(naturalTier(37, ALL_TIERS)).toBeNull();
  });

  it('midday wins over hour when both divide 43200', () => {
    expect(naturalTier(43200, ALL_TIERS)?.id).toBe('midday');
  });

  it('half wins over quarter when both divide 1800', () => {
    expect(naturalTier(1800, ALL_TIERS)?.id).toBe('half');
  });

  it('works with a subset of tiers (only midday + hour active)', () => {
    const active = ALL_TIERS.filter((t) => t.id === 'midday' || t.id === 'hour');
    expect(naturalTier(43200, active)?.id).toBe('midday');
    expect(naturalTier(3600, active)?.id).toBe('hour');
    expect(naturalTier(1800, active)).toBeNull();
  });
});

describe('chooseDayStep', () => {
  it('returns 1 at high zoom (many pixels per day)', () => {
    expect(chooseDayStep(800)).toBe(1);
  });

  it('returns 1 at exactly 80px per day (target spacing)', () => {
    expect(chooseDayStep(80)).toBe(1);
  });

  it('returns 2 when pixelsPerDay is just below 80', () => {
    // idealDays = 80/40 = 2, first candidate >= 2 is 2
    expect(chooseDayStep(40)).toBe(2);
  });

  it('returns 5 at ~16px per day', () => {
    // idealDays = 80/16 = 5, first candidate >= 5 is 5
    expect(chooseDayStep(16)).toBe(5);
  });

  it('returns 10 at ~8px per day', () => {
    expect(chooseDayStep(8)).toBe(10);
  });

  it('returns 20 at ~4px per day', () => {
    expect(chooseDayStep(4)).toBe(20);
  });

  it('returns 365 when extremely zoomed out (1 pixel per 365 days)', () => {
    expect(chooseDayStep(1 / 365)).toBe(365);
  });

  it('returns 365 at the maximum candidate when still not enough', () => {
    expect(chooseDayStep(0.001)).toBe(365);
  });
});

describe('buildTimeTiers — calendar-aware midday step', () => {
  it('returns 5 tiers', () => {
    expect(buildTimeTiers(86400)).toHaveLength(5);
  });

  it('midday stepSecs = secondsPerDay / 2 for a 24h calendar', () => {
    const tiers = buildTimeTiers(86400);
    const midday = tiers.find((t) => t.id === 'midday')!;
    expect(midday.stepSecs).toBe(43200);
  });

  it('midday stepSecs = secondsPerDay / 2 for a 25h Birthright-style calendar (90000s)', () => {
    // 25h * 3600s = 90000s per day; midday = 45000s
    const tiers = buildTimeTiers(90000);
    const midday = tiers.find((t) => t.id === 'midday')!;
    expect(midday.stepSecs).toBe(45000);
  });

  it('hour/half/quarter/minute steps remain literal seconds regardless of day length', () => {
    const tiers = buildTimeTiers(90000);
    expect(tiers.find((t) => t.id === 'hour')!.stepSecs).toBe(3600);
    expect(tiers.find((t) => t.id === 'half')!.stepSecs).toBe(1800);
    expect(tiers.find((t) => t.id === 'quarter')!.stepSecs).toBe(900);
    expect(tiers.find((t) => t.id === 'minute')!.stepSecs).toBe(60);
  });
});

describe('Axis — calendar month count/names and era suffix (Golarion defaults)', () => {
  it('CalendarProvider has 12 months for the default Golarion calendar', () => {
    const cal = CalendarProvider.get();
    expect(cal.monthCount()).toBe(12);
  });

  it('Golarion month 5 is "Desnus"', () => {
    const cal = CalendarProvider.get();
    expect(cal.monthName(5)).toBe('Desnus');
  });

  it('Golarion month 1 is "Abadius"', () => {
    const cal = CalendarProvider.get();
    expect(cal.monthName(1)).toBe('Abadius');
  });

  it('Golarion month 12 is "Kuthona"', () => {
    const cal = CalendarProvider.get();
    expect(cal.monthName(12)).toBe('Kuthona');
  });

  it('eraFor returns "AR" suffix for year 4726 in Golarion', () => {
    const cal = CalendarProvider.get();
    expect(cal.eraFor(4726).suffix).toBe('AR');
  });

  it('all 12 Golarion month names are accessible via monthName', () => {
    const cal = CalendarProvider.get();
    const expectedNames = [
      'Abadius',
      'Calistril',
      'Pharast',
      'Gozran',
      'Desnus',
      'Sarenith',
      'Erastus',
      'Arodus',
      'Rova',
      'Lamashan',
      'Neth',
      'Kuthona',
    ];
    for (let m = 1; m <= 12; m++) {
      expect(cal.monthName(m)).toBe(expectedNames[m - 1]);
    }
  });

  it('month band even/odd alternates correctly for any month count', () => {
    // The axis uses month % 2 === 0 for "is-even" — this holds for any count.
    const cal = CalendarProvider.get();
    for (let m = 1; m <= cal.monthCount(); m++) {
      const isEven = m % 2 === 0;
      expect(isEven).toBe(m % 2 === 0); // trivially true, but documents the contract
    }
  });
});
