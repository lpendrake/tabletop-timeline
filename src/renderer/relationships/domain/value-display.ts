/**
 * Pure view models for the three ways a track value renders: a bar (banded
 * numeric), a plain number (unbanded numeric), a ladder (ordinal), or chips
 * (categorical). No React, no formatting decisions beyond what `ResolvedTrack`
 * already exposes (`format`, `positions`, `optionFor`).
 */

import type { TrackValue } from '../../../shared/relationships/model';
import type { ResolvedTrack } from '../../../shared/relationships/resolve';

export interface BarDisplay {
  kind: 'bar';
  /** 0..1 position within the track's effective range. */
  fraction: number;
  bands: { key: string; label: string; startFraction: number }[];
  label: string;
}

export interface NumberDisplay {
  kind: 'number';
  label: string;
}

export interface LadderDisplay {
  kind: 'ladder';
  rungs: { key: string; label: string; active: boolean }[];
}

export interface ChipsDisplay {
  kind: 'chips';
  chips: { key: string; label: string; mutual: boolean }[];
}

export type ValueDisplay = BarDisplay | NumberDisplay | LadderDisplay | ChipsDisplay;

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function buildBarDisplay(track: ResolvedTrack, value: TrackValue): BarDisplay {
  if (track.kind !== 'numeric') throw new Error('buildBarDisplay requires a numeric track');
  const bands = track.bands ?? [];
  const starts = bands.map((b) => b.start);
  const n = Number(value);

  // Bounded axes use min/max directly; an unbounded axis falls back to the
  // band starts (plus the initial value, so it's never outside the range).
  const rangeMin = track.min ?? Math.min(...starts, track.initial, n);
  const rangeMax = track.max ?? Math.max(...starts, track.initial, n);
  const span = rangeMax - rangeMin;

  const fraction = span === 0 ? 0 : clamp01((n - rangeMin) / span);
  const bandDisplays = bands.map((band) => ({
    key: band.key,
    label: band.label,
    startFraction: span === 0 ? 0 : clamp01((band.start - rangeMin) / span),
  }));

  return { kind: 'bar', fraction, bands: bandDisplays, label: track.format(value) };
}

export function valueDisplay(track: ResolvedTrack, value: TrackValue): ValueDisplay {
  if (track.kind === 'numeric') {
    if (track.bands.length > 0) {
      return buildBarDisplay(track, value);
    }
    return { kind: 'number', label: track.format(value) };
  }

  if (track.kind === 'ordinal') {
    const current = String(value);
    const rungs = track.rungs.map((rung) => ({
      key: rung.key,
      label: rung.label,
      active: rung.key === current,
    }));
    return { kind: 'ladder', rungs };
  }

  const keys = Array.isArray(value) ? value : [];
  const chips = keys.map((key) => {
    const option = track.optionFor(key);
    return { key, label: option?.label ?? key, mutual: option?.mutual ?? false };
  });
  return { kind: 'chips', chips };
}
