/**
 * Colours for bands and rungs by position relative to a track's initial value.
 * The spec carries no colours; everything here resolves to theme CSS variables.
 *
 * - The band/rung holding the initial value is neutral.
 * - Positions below run toward negative, above toward positive, intensity 0..1
 *   growing with distance from the neutral one.
 * - When nothing sits below the initial (it is in the first band/rung), or a
 *   numeric track has no bands, everything uses accent gold.
 */
import type { NumericTrack, OrdinalTrack } from '../../../shared/relationships';

export type ScaleTone = 'negative' | 'neutral' | 'positive' | 'accent';

export interface ScaleColour {
  tone: ScaleTone;
  /** 0..1; 0 for neutral, 1 for accent. */
  intensity: number;
  /** A CSS variable reference, never a hex value. */
  cssVar: string;
}

const NEGATIVE_VAR = 'var(--theme-relationships-scale-negative)';
const NEUTRAL_VAR = 'var(--theme-relationships-scale-neutral)';
const POSITIVE_VAR = 'var(--theme-relationships-scale-positive)';
const ACCENT_VAR = 'var(--theme-accent-gold)';

const ACCENT: ScaleColour = { tone: 'accent', intensity: 1, cssVar: ACCENT_VAR };

/** Colour of position `index` in a scale of `count` positions whose neutral is `neutralIndex`. */
export function scaleColourAt(index: number, neutralIndex: number, count: number): ScaleColour {
  if (count <= 0 || neutralIndex <= 0 || neutralIndex >= count) return ACCENT;
  if (index === neutralIndex) return { tone: 'neutral', intensity: 0, cssVar: NEUTRAL_VAR };
  if (index < neutralIndex) {
    const clamped = Math.max(index, 0);
    return {
      tone: 'negative',
      intensity: (neutralIndex - clamped) / neutralIndex,
      cssVar: NEGATIVE_VAR,
    };
  }
  const above = count - 1 - neutralIndex;
  const clamped = Math.min(index, count - 1);
  return {
    tone: 'positive',
    intensity: above === 0 ? 1 : (clamped - neutralIndex) / above,
    cssVar: POSITIVE_VAR,
  };
}

/** Index of the band containing `value` (values below the first band count as the first). */
export function bandIndexFor(track: NumericTrack, value: number): number {
  let found = 0;
  track.bands.forEach((band, i) => {
    if (value >= band.start) found = i;
  });
  return found;
}

/** Colour of a numeric track's band, by its key. Unknown key or no bands: accent gold. */
export function bandColour(track: NumericTrack, bandKey: string): ScaleColour {
  const index = track.bands.findIndex((b) => b.key === bandKey);
  if (index < 0 || track.bands.length === 0) return ACCENT;
  const neutral = bandIndexFor(track, track.initial);
  return scaleColourAt(index, neutral, track.bands.length);
}

/** Colour of the band a numeric value falls in. Tracks without bands: accent gold. */
export function valueColour(track: NumericTrack, value: number): ScaleColour {
  if (track.bands.length === 0) return ACCENT;
  const neutral = bandIndexFor(track, track.initial);
  return scaleColourAt(bandIndexFor(track, value), neutral, track.bands.length);
}

/** Colour of an ordinal track's rung, by its key. Unknown key: accent gold. */
export function rungColour(track: OrdinalTrack, rungKey: string): ScaleColour {
  const index = track.rungIndex(rungKey);
  if (index < 0) return ACCENT;
  return scaleColourAt(index, track.rungIndex(track.initial), track.rungs.length);
}

/**
 * A CSS colour expressing intensity: a mix of the tone's variable into the neutral
 * variable (negative/positive), or the plain variable (neutral/accent). CSS vars only.
 */
export function scaleColourCss(colour: ScaleColour): string {
  if (colour.tone === 'negative' || colour.tone === 'positive') {
    const pct = Math.round(Math.min(1, Math.max(0, colour.intensity)) * 100);
    return `color-mix(in srgb, ${colour.cssVar} ${pct}%, ${NEUTRAL_VAR})`;
  }
  return colour.cssVar;
}
