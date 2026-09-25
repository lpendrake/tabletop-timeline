/**
 * Per-ledger x now value cache for the Relationships view. Recomputation from
 * a ledger's deltas is total (see `src/shared/relationships/AGENTS.md`), so
 * this cache exists purely to make re-renders (e.g. after `now` changes but
 * most ledgers are unchanged) fast — it never changes what gets computed.
 *
 * Keyed by ledger *object identity* via WeakMap: an index update that
 * produces a new ledger object naturally misses, no invalidation needed.
 */

import type { RelationshipDelta, Ledger, TrackValue } from '../../../shared/relationships/model';
import type { ResolvedTrack } from '../../../shared/relationships/resolve';
import {
  compareDeltas,
  computeValueFromSorted,
  currentValue,
  type Step,
} from '../../../shared/relationships/current-value';

export interface ValueCache {
  valueOf(ledger: Ledger, track: ResolvedTrack, now: number): TrackValue;
  stepsOf(ledger: Ledger, track: ResolvedTrack, now: number): Step[];
}

export function createValueCache(): ValueCache {
  // Deltas sorted once per ledger; a `now` change re-folds without re-sorting.
  const sortedDeltasByLedger = new WeakMap<Ledger, RelationshipDelta[]>();

  function sortedDeltasOf(ledger: Ledger): RelationshipDelta[] {
    let sorted = sortedDeltasByLedger.get(ledger);
    if (!sorted) {
      sorted = [...ledger.deltas].sort(compareDeltas);
      sortedDeltasByLedger.set(ledger, sorted);
    }
    return sorted;
  }

  const valuesByLedger = new WeakMap<Ledger, WeakMap<ResolvedTrack, Map<number, TrackValue>>>();
  const stepsByLedger = new WeakMap<Ledger, WeakMap<ResolvedTrack, Map<number, Step[]>>>();

  function valueOf(ledger: Ledger, track: ResolvedTrack, now: number): TrackValue {
    let byTrack = valuesByLedger.get(ledger);
    if (!byTrack) {
      byTrack = new WeakMap();
      valuesByLedger.set(ledger, byTrack);
    }
    let byNow = byTrack.get(track);
    if (!byNow) {
      byNow = new Map();
      byTrack.set(track, byNow);
    }
    const cached = byNow.get(now);
    if (cached !== undefined) return cached;

    const value = computeValueFromSorted(sortedDeltasOf(ledger), track, now);
    byNow.set(now, value);
    return value;
  }

  function stepsOf(ledger: Ledger, track: ResolvedTrack, now: number): Step[] {
    let byTrack = stepsByLedger.get(ledger);
    if (!byTrack) {
      byTrack = new WeakMap();
      stepsByLedger.set(ledger, byTrack);
    }
    let byNow = byTrack.get(track);
    if (!byNow) {
      byNow = new Map();
      byTrack.set(track, byNow);
    }
    const cached = byNow.get(now);
    if (cached) return cached;

    const steps = currentValue(ledger, track, now, { withSteps: true }).steps;
    byNow.set(now, steps);
    return steps;
  }

  return { valueOf, stepsOf };
}
