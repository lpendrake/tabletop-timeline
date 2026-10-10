import { describe, it, expect } from 'vitest';
import {
  EMPTY_TRACK_LIBRARY,
  pf2eReputationSpec,
  attitudeSpec,
  resolveTrack,
  resolveTrackSpec,
  type NumericTrack,
  type OrdinalTrack,
} from '../../../../shared/relationships';
import {
  bandColour,
  optionColour,
  rungColour,
  scaleColourCss,
  valueColour,
  type ScaleColour,
} from '../scale-colour';

const rp01 = resolveTrack('rp01', EMPTY_TRACK_LIBRARY) as NumericTrack;
const at01 = resolveTrack('at01', EMPTY_TRACK_LIBRARY) as OrdinalTrack;

function numericFixture(keys: string[], initial: number, withBands = true): NumericTrack {
  return resolveTrackSpec({
    ...pf2eReputationSpec,
    id: 'fx',
    min: 0,
    max: Math.max(keys.length * 10, 10),
    initial,
    bands: withBands ? keys.map((key, i) => ({ key, label: key, start: i * 10 })) : undefined,
  }) as NumericTrack;
}

function ordinalFixture(keys: string[], initial: string): OrdinalTrack {
  return resolveTrackSpec({
    ...attitudeSpec,
    id: 'fo',
    rungs: keys.map((key) => ({ key, label: key })),
    initial,
  }) as OrdinalTrack;
}

const tone = (c: ScaleColour) => c.tone;
const CSS_VAR_ONLY =
  /^(var\(--[a-z-]+\)|color-mix\(in srgb, var\(--[a-z-]+\) \d+%, var\(--[a-z-]+\)\))$/;

describe('scale-colour', () => {
  it('optionColour returns accent', () => {
    const c = optionColour();
    expect(c.tone).toBe('accent');
    expect(scaleColourCss(c)).toBe('var(--theme-accent-gold)');
  });

  it('PF2E Reputation: every band gets the expected tone', () => {
    const expected: Record<string, string> = {
      hunted: 'negative',
      hated: 'negative',
      disliked: 'negative',
      ignored: 'neutral',
      liked: 'positive',
      admired: 'positive',
      revered: 'positive',
    };
    expect(rp01.bands).toHaveLength(7);
    for (const band of rp01.bands) {
      expect(tone(bandColour(rp01, band.key)), band.key).toBe(expected[band.key]);
    }
  });

  it('PF2E intensity grows with distance from Ignored', () => {
    const i = (k: string) => bandColour(rp01, k).intensity;
    expect(i('hunted')).toBeGreaterThan(i('hated'));
    expect(i('hated')).toBeGreaterThan(i('disliked'));
    expect(i('disliked')).toBeGreaterThan(0);
    expect(i('revered')).toBeGreaterThan(i('admired'));
    expect(i('admired')).toBeGreaterThan(i('liked'));
    expect(i('liked')).toBeGreaterThan(0);
    expect(i('hunted')).toBe(1);
    expect(i('revered')).toBe(1);
    expect(i('ignored')).toBe(0);
  });

  it('Attitude: every rung gets the expected tone', () => {
    const expected: Record<string, string> = {
      hostile: 'negative',
      unfriendly: 'negative',
      indifferent: 'neutral',
      friendly: 'positive',
      helpful: 'positive',
    };
    expect(at01.rungs).toHaveLength(5);
    for (const rung of at01.rungs) {
      expect(tone(rungColour(at01, rung.key)), rung.key).toBe(expected[rung.key]);
    }
    expect(rungColour(at01, 'hostile').intensity).toBeGreaterThan(
      rungColour(at01, 'unfriendly').intensity,
    );
  });

  it('initial value at the bottom uses accent gold throughout', () => {
    const numeric = numericFixture(['a', 'b', 'c', 'd'], 5);
    for (const key of ['a', 'b', 'c', 'd']) {
      const c = bandColour(numeric, key);
      expect(c.tone).toBe('accent');
      expect(c.cssVar).toBe('var(--theme-accent-gold)');
    }
    const ordinal = ordinalFixture(['low', 'mid', 'high'], 'low');
    for (const key of ['low', 'mid', 'high']) {
      expect(rungColour(ordinal, key).cssVar).toBe('var(--theme-accent-gold)');
    }
  });

  it('ten-band fixture track maps every band', () => {
    const keys = Array.from({ length: 10 }, (_, i) => `b${i}`);
    const track = numericFixture(keys, 40); // b4 neutral: 4 below, 5 above
    const tones = keys.map((k) => tone(bandColour(track, k)));
    expect(tones).toEqual([
      'negative',
      'negative',
      'negative',
      'negative',
      'neutral',
      'positive',
      'positive',
      'positive',
      'positive',
      'positive',
    ]);
    expect(bandColour(track, 'b0').intensity).toBe(1);
    expect(bandColour(track, 'b9').intensity).toBe(1);
    expect(bandColour(track, 'b3').intensity).toBeCloseTo(0.25);
    expect(bandColour(track, 'b5').intensity).toBeCloseTo(0.2);
  });

  it('numeric track with no bands is accent gold', () => {
    const track = numericFixture([], 0, false);
    expect(track.bands).toHaveLength(0);
    expect(valueColour(track, 5).tone).toBe('accent');
    expect(valueColour(track, 5).cssVar).toBe('var(--theme-accent-gold)');
  });

  it('value helper matches band boundaries', () => {
    const t = (v: number) => tone(valueColour(rp01, v));
    expect(t(-50)).toBe('negative');
    expect(valueColour(rp01, -50).intensity).toBe(1);
    expect(t(-30)).toBe('negative');
    expect(valueColour(rp01, -30).intensity).toBe(1);
    expect(t(-29)).toBe('negative');
    expect(valueColour(rp01, -29).intensity).toBeCloseTo(2 / 3);
    expect(t(4)).toBe('neutral');
    expect(t(5)).toBe('positive');
    expect(valueColour(rp01, 5).intensity).toBeCloseTo(1 / 3);
    expect(t(50)).toBe('positive');
    expect(valueColour(rp01, 50).intensity).toBe(1);
  });

  it('only CSS variables are returned, never hex', () => {
    const all: ScaleColour[] = [
      ...rp01.bands.map((b) => bandColour(rp01, b.key)),
      ...at01.rungs.map((r) => rungColour(at01, r.key)),
      ...[-50, -30, -29, 4, 5, 50].map((v) => valueColour(rp01, v)),
      valueColour(numericFixture([], 0, false), 1),
      rungColour(at01, 'nonexistent'),
    ];
    for (const c of all) {
      expect(c.cssVar).toMatch(/^var\(--[a-z-]+\)$/);
      expect(c.intensity).toBeGreaterThanOrEqual(0);
      expect(c.intensity).toBeLessThanOrEqual(1);
      expect(scaleColourCss(c)).toMatch(CSS_VAR_ONLY);
      expect(scaleColourCss(c)).not.toMatch(/#/);
    }
    expect(scaleColourCss(bandColour(rp01, 'hated'))).toBe(
      'color-mix(in srgb, var(--theme-relationships-scale-negative) 67%, var(--theme-relationships-scale-neutral))',
    );
  });
});
