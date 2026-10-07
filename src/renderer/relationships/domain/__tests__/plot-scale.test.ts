import { describe, expect, it } from 'vitest';
import {
  bandSpans,
  niceStep,
  percent,
  plotRange,
  plotScale,
  plotTicks,
  valueFraction,
} from '../plot-scale';
import {
  halfUnbounded,
  noBands,
  openFloorBands,
  pf2e,
  pinned,
  tenBands,
  unbounded,
  unboundedBands,
} from './numeric-fixtures';

const CSS_VAR_ONLY =
  /^(var\(--theme-[a-z-]+\)|color-mix\(in srgb, var\(--theme-[a-z-]+\) \d+%, var\(--theme-[a-z-]+\)\))$/;

describe('plot-scale', () => {
  it('PF2E range, spans, shading and zero line', () => {
    const scale = plotScale(pf2e, []);
    expect([scale.lo, scale.hi]).toEqual([-50, 50]);
    const expected = [
      [0, 0.21],
      [0.21, 0.36],
      [0.36, 0.46],
      [0.46, 0.55],
      [0.55, 0.65],
      [0.65, 0.8],
      [0.8, 1],
    ];
    expect(scale.bands).toHaveLength(7);
    scale.bands.forEach((span, i) => {
      expect(span.start).toBeCloseTo(expected[i][0], 5);
      expect(span.end).toBeCloseTo(expected[i][1], 5);
      expect(span.centre).toBeCloseTo((expected[i][0] + expected[i][1]) / 2, 5);
    });
    expect(scale.zero).toBeCloseTo(0.5, 5);
    expect(scale.ticks).toEqual([]);
  });

  it('band colours are theme variables only', () => {
    for (const track of [pf2e, tenBands, unboundedBands]) {
      for (const span of plotScale(track, [0]).bands) {
        expect(span.colour).toMatch(CSS_VAR_ONLY);
        expect(span.colour).not.toContain('#');
      }
    }
  });

  it('ten bands are all labelled', () => {
    const spans = plotScale(tenBands, []).bands;
    expect(spans.map((s) => s.label)).toEqual(Array.from({ length: 10 }, (_, i) => `b${i}`));
    for (const span of spans) expect(span.end - span.start).toBeCloseTo(0.1, 5);
  });

  it('a track without bands gets ticks', () => {
    const scale = plotScale(noBands, []);
    expect([scale.lo, scale.hi]).toEqual([-10, 10]);
    expect(scale.ticks.map((t) => t.value)).toEqual([-10, -5, 0, 5, 10]);
    expect(scale.ticks.map((t) => t.fraction)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(scale.bands).toEqual([]);
    expect(scale.zero).toBe(0.5);
  });

  it('an unbounded track pads 10% and rounds outward to ticks', () => {
    const scale = plotScale(unbounded, [3, 47]);
    expect([scale.lo, scale.hi, scale.step]).toEqual([-10, 60, 10]);
    expect(scale.zero).toBeCloseTo(1 / 7, 5);
  });

  it('an unbounded track follows negative data', () => {
    const range = plotRange(unbounded, [-40, -12]);
    expect([range.lo, range.hi]).toEqual([-50, 10]);
  });

  it('an unbounded track with no spread still has a range', () => {
    const scale = plotScale(unbounded, []);
    expect([scale.lo, scale.hi, scale.step]).toEqual([-1, 1, 1]);
    expect(scale.zero).toBe(0.5);
  });

  it('a half-unbounded track keeps its known bound exactly', () => {
    const scale = plotScale(halfUnbounded, [7, 120]);
    expect([scale.lo, scale.hi, scale.step]).toEqual([0, 140, 20]);
    expect(scale.zero).toBeNull();
  });

  it('unbounded bands clip to the data range', () => {
    const scale = plotScale(unboundedBands, [2, 4]);
    expect([scale.lo, scale.hi]).toEqual([-1, 5]);
    expect(scale.bands.map((s) => s.key)).toEqual(['low', 'mid']);
    expect(scale.bands[0].start).toBe(0);
    expect(scale.bands[1].end).toBe(1);
  });

  it('a track with no floor and a ceiling stretches its first band to the left edge', () => {
    const scale = plotScale(openFloorBands, [-20, 2]);
    expect(scale.hi).toBe(10);
    expect(scale.lo).toBeLessThan(-5);
    expect(scale.bands.map((s) => s.key)).toEqual(['low', 'high']);
    expect(scale.bands[0].start).toBe(0);
    expect(scale.bands[1].end).toBe(1);
    expect(scale.hasBands).toBe(true);
  });

  it('a bounded track with min equal to max does not crash', () => {
    const scale = plotScale(pinned, [5]);
    expect([scale.lo, scale.hi]).toEqual([5, 5]);
    expect(scale.ticks).toHaveLength(1);
    expect(scale.ticks[0]).toMatchObject({ value: 5, fraction: 0.5, label: '5' });
    expect(scale.zero).toBeNull();
  });

  it('niceStep picks 1, 2 or 5 times a power of ten', () => {
    expect(niceStep(100, 5)).toBe(20);
    expect(niceStep(56.4, 5)).toBe(10);
    expect(niceStep(20, 5)).toBe(5);
    expect(niceStep(2, 5)).toBe(0.5);
    expect(niceStep(2, 5, 1)).toBe(1);
    expect(niceStep(0.3, 5)).toBe(0.05);
  });

  it('the first tick aligns its label to start, the last to end, the rest centre', () => {
    const ticks = plotTicks({ lo: -10, hi: 10, step: 5 });
    expect(ticks.map((t) => t.align)).toEqual(['start', 'centre', 'centre', 'centre', 'end']);
  });

  it('a lone tick in the middle of the axis is centred', () => {
    expect(plotTicks({ lo: 5, hi: 5, step: 1 }).map((t) => t.align)).toEqual(['centre']);
  });

  it('tick labels carry no floating-point noise', () => {
    const labels = plotTicks({ lo: 0, hi: 0.5, step: 0.1 }).map((t) => t.label);
    expect(labels).toEqual(['0', '0.1', '0.2', '0.3', '0.4', '0.5']);
  });

  it('negative tick labels use U+2212', () => {
    const labels = plotTicks({ lo: -10, hi: 10, step: 10 }).map((t) => t.label);
    expect(labels).toEqual(['\u221210', '0', '10']);
  });

  it('valueFraction clamps to the axis', () => {
    const range = plotRange(pf2e, []);
    expect(valueFraction(range, -60)).toBe(0);
    expect(valueFraction(range, 60)).toBe(1);
    expect(valueFraction(range, 18)).toBeCloseTo(0.68, 5);
    expect(valueFraction({ lo: 3, hi: 3, step: 1 }, 3)).toBe(0.5);
  });

  it('formats fractions as percentages', () => {
    expect(percent(0.68)).toBe('68%');
    expect(percent(0)).toBe('0%');
    expect(percent(1 / 3)).toBe('33.33%');
  });

  it('bandSpans of an unbounded first band starts at the axis edge', () => {
    const range = plotRange(unboundedBands, [-30, 30]);
    expect(bandSpans(unboundedBands, range)[0].start).toBe(0);
  });
});
