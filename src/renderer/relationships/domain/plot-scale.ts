/**
 * The shared horizontal axis of the numeric Relationships tab: one range per
 * track, band spans, ticks and the zero line, all as 0..1 fractions of the axis
 * (components render them as CSS percentages). Pure — no IO, no React.
 */
import type { NumericTrack } from '../../../shared/relationships';
import { numericBandRanges, startingValue } from '../../../shared/relationships';
import { formatNumber, tidy } from './row-display';
import { bandColour, scaleColourCss } from './scale-colour';

/** Share of the data extent added beyond an unbounded edge. */
const PLOT_PADDING = 0.1;
/** Roughly how many ticks (or steps across the range) the axis aims for. */
const TICK_TARGET = 5;

export interface PlotRange {
  lo: number;
  hi: number;
  /** Tick step; the edges of an unbounded side land on multiples of it. */
  step: number;
}

export interface BandSpan {
  key: string;
  label: string;
  /** Fractions of the axis. */
  start: number;
  end: number;
  centre: number;
  colour: string;
  /** Odd original band index: alternate bands are shaded so neighbours read apart. */
  shaded: boolean;
}

export interface PlotTick {
  value: number;
  fraction: number;
  label: string;
}

export interface PlotScale extends PlotRange {
  /** Whether the track declares bands (spans may still all fall outside the range). */
  hasBands: boolean;
  bands: BandSpan[];
  ticks: PlotTick[];
  zero: number | null;
}

/** A 1/2/5 × 10^k step closest to `span / target`, never below `minStep`. */
export function niceStep(span: number, target: number = TICK_TARGET, minStep = 0): number {
  const raw = span / target;
  if (!(raw > 0)) return minStep;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const ratio = raw / magnitude;
  const nice = ratio < 1.5 ? 1 : ratio < 3 ? 2 : ratio < 7 ? 5 : 10;
  return Math.max(tidy(nice * magnitude), minStep);
}

/**
 * The axis range. A bound the track declares is used exactly; an unbounded side
 * comes from the data (row values and the starting value), padded and rounded
 * outward to the tick step.
 */
export function plotRange(track: NumericTrack, values: readonly number[]): PlotRange {
  const { min, max } = track;
  const known = [min, max].filter((b): b is number => b !== null);
  const data = [...values, Number(startingValue(track)), ...known];
  const dataLo = Math.min(...data);
  const dataHi = Math.max(...data);
  const dataSpan = dataHi - dataLo;
  const padding =
    dataSpan > 0 ? dataSpan * PLOT_PADDING : Math.max(Math.abs(dataLo) * PLOT_PADDING, track.step);

  const paddedLo = min ?? dataLo - padding;
  const paddedHi = max ?? dataHi + padding;
  const step = niceStep(paddedHi - paddedLo, TICK_TARGET, track.step);
  return {
    lo: min ?? tidy(Math.floor(tidy(paddedLo / step)) * step),
    hi: max ?? tidy(Math.ceil(tidy(paddedHi / step)) * step),
    step,
  };
}

/** Position of `value` along the axis, clamped to [0, 1]; 0.5 for an empty range. */
export function valueFraction(range: PlotRange, value: number): number {
  if (range.hi === range.lo) return 0.5;
  return Math.min(1, Math.max(0, (value - range.lo) / (range.hi - range.lo)));
}

/** Band backgrounds clipped to the range; bands entirely outside it are dropped. */
export function bandSpans(track: NumericTrack, range: PlotRange): BandSpan[] {
  const spans: BandSpan[] = [];
  numericBandRanges(track.bands, track.max).forEach((band, index) => {
    const start = Math.max(index === 0 && track.min === null ? range.lo : band.start, range.lo);
    const end = Math.min(band.end ?? range.hi, range.hi);
    if (end <= start) return;
    const from = valueFraction(range, start);
    const to = valueFraction(range, end);
    spans.push({
      key: band.key,
      label: band.label,
      start: from,
      end: to,
      centre: (from + to) / 2,
      colour: scaleColourCss(bandColour(track, band.key)),
      shaded: index % 2 === 1,
    });
  });
  return spans;
}

/** A tick at every multiple of the step inside the range. */
export function plotTicks(range: PlotRange): PlotTick[] {
  if (!(range.step > 0)) return [];
  const ticks: PlotTick[] = [];
  const first = Math.ceil(tidy(range.lo / range.step));
  const last = Math.floor(tidy(range.hi / range.step));
  for (let i = first; i <= last; i++) {
    const value = tidy(i * range.step);
    ticks.push({ value, fraction: valueFraction(range, value), label: formatNumber(value) });
  }
  return ticks;
}

/** Position of zero, only when the range crosses it. */
export function zeroFraction(range: PlotRange): number | null {
  return range.lo < 0 && range.hi > 0 ? valueFraction(range, 0) : null;
}

/** The whole axis for a track and the values shown on it. Ticks only when there are no bands. */
export function plotScale(track: NumericTrack, values: readonly number[]): PlotScale {
  const range = plotRange(track, values);
  const hasBands = track.bands.length > 0;
  return {
    ...range,
    hasBands,
    bands: bandSpans(track, range),
    ticks: hasBands ? [] : plotTicks(range),
    zero: zeroFraction(range),
  };
}

/** A fraction as a CSS percentage, `0.68` → `'68%'`. */
export function percent(fraction: number): string {
  return `${Number((fraction * 100).toFixed(2))}%`;
}
