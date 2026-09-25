/**
 * Folds a ledger's deltas into a current value as of a point in in-game time.
 * Deltas are never mutated or reordered in place — a sorted copy is made once.
 */

import { DeltaOp, Ledger, RelationshipDelta, TrackValue } from './model.js';
import { ResolvedTrack } from './resolve.js';

/**
 * Orders deltas the way they're applied: undated deltas (declared directly on
 * a note, `at === null`) first — sorted by declaring path then ordinal — then
 * dated deltas in ascending `at`, ties broken by path then ordinal.
 */
export function compareDeltas(a: RelationshipDelta, b: RelationshipDelta): number {
  const aUndated = a.at === null;
  const bUndated = b.at === null;
  if (aUndated !== bUndated) return aUndated ? -1 : 1;

  if (!aUndated && !bUndated && a.at !== b.at) {
    return (a.at as number) - (b.at as number);
  }

  if (a.declaredIn.path !== b.declaredIn.path) {
    return a.declaredIn.path < b.declaredIn.path ? -1 : 1;
  }
  return a.declaredIn.ordinal - b.declaredIn.ordinal;
}

export interface Step {
  delta: RelationshipDelta;
  runningValue: TrackValue;
  applied: boolean;
  reset: boolean;
}

export interface CurrentValueResult {
  value: TrackValue;
  steps: Step[];
}

/**
 * Applies a single delta op to a value. Exhaustive over `DeltaOp['op']` by
 * construction (every branch returns) — do not add a `default` branch, so
 * TypeScript keeps enforcing exhaustiveness here if a new op is ever added.
 */
export function applyDelta(value: TrackValue, op: DeltaOp, track: ResolvedTrack): TrackValue {
  switch (op.op) {
    case 'adjust':
      return track.adjust(value, op.by);
    case 'set':
      return track.clamp(op.value);
    case 'add': {
      const current = Array.isArray(value) ? value : [];
      return track.clamp([...current, op.key]);
    }
    case 'remove': {
      const current = Array.isArray(value) ? value : [];
      return track.clamp(current.filter((k) => k !== op.key));
    }
  }
}

export interface CurrentValueOptions {
  withSteps?: boolean;
}

/**
 * Computes the current value of a ledger at `now`, optionally with the full
 * step-by-step trace `withSteps` (default true) exposes for renderers.
 */
export function currentValue(
  ledger: Ledger,
  track: ResolvedTrack,
  now: number,
  options: CurrentValueOptions = {},
): CurrentValueResult {
  const withSteps = options.withSteps ?? true;
  const sorted = [...ledger.deltas].sort(compareDeltas);

  let value: TrackValue = track.clamp(track.initial);
  let runningValue: TrackValue = value;
  const steps: Step[] = withSteps ? new Array(sorted.length) : [];

  for (let i = 0; i < sorted.length; i++) {
    const delta = sorted[i];
    const applied = delta.at === null || delta.at <= now;
    runningValue = applyDelta(runningValue, delta, track);
    if (applied) value = runningValue;

    if (withSteps) {
      steps[i] = {
        delta,
        runningValue,
        applied,
        reset: delta.op === 'set',
      };
    }
  }

  return { value, steps };
}

/** Value-only variant of `currentValue` that skips building the step trace. */
export function computeValue(ledger: Ledger, track: ResolvedTrack, now: number): TrackValue {
  return currentValue(ledger, track, now, { withSteps: false }).value;
}
