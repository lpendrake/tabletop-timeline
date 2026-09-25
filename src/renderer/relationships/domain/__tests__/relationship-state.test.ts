import { describe, it, expect } from 'vitest';

import {
  resolveTrackSpec,
  pf2eReputationSpec,
  type RelationshipDelta,
  type Ledger,
} from '../../../../shared/relationships/index';
import { describeTrackRow } from '../relationship-state';
import { createValueCache } from '../value-cache';
import type { TrackRow } from '../group-relationships';

const rp01 = resolveTrackSpec(pf2eReputationSpec);

function delta(
  partial: Partial<RelationshipDelta> & Pick<RelationshipDelta, 'op'>,
): RelationshipDelta {
  return { at: null, declaredIn: { path: 'a.md', ordinal: 0 }, ...partial } as RelationshipDelta;
}

function trackRow(ledger: Ledger, track = rp01 as typeof rp01 | null): TrackRow {
  return {
    key: `${ledger.holder}|${ledger.observer}|${ledger.track}`,
    ledger,
    track,
    trackId: ledger.track,
  };
}

describe('relationships with only future changes are faded at the initial value', () => {
  it('marks onlyFuture and reports the initial value when every delta is dated after now', () => {
    const ledger: Ledger = {
      holder: 'aaaa',
      observer: 'bbbb',
      track: rp01.id,
      deltas: [delta({ op: 'adjust', by: 20, at: 500 }), delta({ op: 'adjust', by: 10, at: 600 })],
    };
    const cache = createValueCache();
    const state = describeTrackRow(trackRow(ledger), 100, cache);

    expect(state.onlyFuture).toBe(true);
    expect(state.value).toBe(rp01.clamp(rp01.initial));
    expect(state.unknownTrack).toBe(false);
  });

  it('is not onlyFuture once at least one delta has applied', () => {
    const ledger: Ledger = {
      holder: 'aaaa',
      observer: 'bbbb',
      track: rp01.id,
      deltas: [delta({ op: 'adjust', by: 20, at: 50 }), delta({ op: 'adjust', by: 10, at: 600 })],
    };
    const cache = createValueCache();
    const state = describeTrackRow(trackRow(ledger), 100, cache);

    expect(state.onlyFuture).toBe(false);
    expect(state.value).toBe(20);
  });

  it('an empty ledger is not onlyFuture', () => {
    const ledger: Ledger = { holder: 'aaaa', observer: 'bbbb', track: rp01.id, deltas: [] };
    const cache = createValueCache();
    const state = describeTrackRow(trackRow(ledger), 100, cache);

    expect(state.onlyFuture).toBe(false);
    expect(state.value).toBe(rp01.initial);
  });

  it('reports unknownTrack and a null value when the track cannot resolve', () => {
    const ledger: Ledger = { holder: 'aaaa', observer: 'bbbb', track: 'zzzz', deltas: [] };
    const cache = createValueCache();
    const state = describeTrackRow(trackRow(ledger, null), 100, cache);

    expect(state.unknownTrack).toBe(true);
    expect(state.value).toBeNull();
  });
});
