import { describe, it, expect } from 'vitest';

import {
  resolveTrackSpec,
  pf2eReputationSpec,
  attitudeSpec,
  relationshipTagsSpec,
  type RelationshipDelta,
  type Ledger,
} from '../../../../shared/relationships/index';
import { groupRelationships } from '../group-relationships';
import { describeTrackRow } from '../relationship-state';
import { createValueCache } from '../value-cache';

const rp01 = resolveTrackSpec(pf2eReputationSpec);
const at01 = resolveTrackSpec(attitudeSpec);
const tg01 = resolveTrackSpec(relationshipTagsSpec);

const tracks = new Map([
  [rp01.id, rp01],
  [at01.id, at01],
  [tg01.id, tg01],
]);
const resolveTrack = (id: string) => tracks.get(id) ?? null;
const trackOrder = [rp01.id, at01.id, tg01.id];

const labels: Record<string, string> = {
  aaaa: 'Zara',
  bbbb: 'anna',
  cccc: 'Mira',
};
const labelFor = (id: string) => labels[id] ?? id;

function delta(
  partial: Partial<RelationshipDelta> & Pick<RelationshipDelta, 'op'>,
): RelationshipDelta {
  return { at: null, declaredIn: { path: 'a.md', ordinal: 0 }, ...partial } as RelationshipDelta;
}

function ledger(
  holder: string,
  observer: string,
  track: string,
  deltas: RelationshipDelta[],
): Ledger {
  return { holder, observer, track, deltas };
}

describe('groups by holder with observers nested', () => {
  it('nests observers under each holder', () => {
    const ledgers = [
      ledger('aaaa', 'bbbb', rp01.id, [delta({ op: 'adjust', by: 5 })]),
      ledger('aaaa', 'cccc', at01.id, [delta({ op: 'set', value: 'friendly' })]),
    ];

    const rows = groupRelationships(ledgers, 'holder', { resolveTrack, trackOrder, labelFor });

    expect(rows).toHaveLength(1);
    expect(rows[0].entityId).toBe('aaaa');
    expect(rows[0].children.map((c) => c.entityId).sort()).toEqual(['bbbb', 'cccc']);
    const bbbbRow = rows[0].children.find((c) => c.entityId === 'bbbb')!;
    expect(bbbbRow.holder).toBe('aaaa');
    expect(bbbbRow.observer).toBe('bbbb');
    expect(bbbbRow.tracks).toHaveLength(1);
    expect(bbbbRow.tracks[0].trackId).toBe(rp01.id);
  });
});

describe('groups by observer inverts the nesting', () => {
  it('nests holders under each observer', () => {
    const ledgers = [
      ledger('aaaa', 'bbbb', rp01.id, [delta({ op: 'adjust', by: 5 })]),
      ledger('cccc', 'bbbb', at01.id, [delta({ op: 'set', value: 'friendly' })]),
    ];

    const rows = groupRelationships(ledgers, 'observer', { resolveTrack, trackOrder, labelFor });

    expect(rows).toHaveLength(1);
    expect(rows[0].entityId).toBe('bbbb');
    expect(rows[0].children.map((c) => c.entityId).sort()).toEqual(['aaaa', 'cccc']);
    const aaaaRow = rows[0].children.find((c) => c.entityId === 'aaaa')!;
    expect(aaaaRow.holder).toBe('aaaa');
    expect(aaaaRow.observer).toBe('bbbb');
  });
});

describe('the same relationship reads identically in both grouping modes', () => {
  it('describeTrackRow agrees for every TrackRow key across modes', () => {
    const ledgers = [
      ledger('aaaa', 'bbbb', rp01.id, [delta({ op: 'adjust', by: 12 })]),
      ledger('aaaa', 'cccc', at01.id, [delta({ op: 'set', value: 'hostile' })]),
      ledger('cccc', 'bbbb', tg01.id, [delta({ op: 'add', key: 'member' })]),
    ];

    const now = 100;
    const byHolder = groupRelationships(ledgers, 'holder', { resolveTrack, trackOrder, labelFor });
    const byObserver = groupRelationships(ledgers, 'observer', {
      resolveTrack,
      trackOrder,
      labelFor,
    });

    function flatten(rows: ReturnType<typeof groupRelationships>) {
      const map = new Map<string, ReturnType<typeof describeTrackRow>>();
      const cache = createValueCache();
      for (const outer of rows) {
        for (const inner of outer.children) {
          for (const row of inner.tracks) {
            map.set(row.key, describeTrackRow(row, now, cache));
          }
        }
      }
      return map;
    }

    const holderStates = flatten(byHolder);
    const observerStates = flatten(byObserver);

    expect(holderStates.size).toBe(3);
    expect(observerStates.size).toBe(3);
    for (const [key, state] of holderStates) {
      expect(observerStates.get(key)?.formatted).toBe(state.formatted);
      expect(observerStates.get(key)?.value).toEqual(state.value);
    }
  });
});

describe('sorts rows alphabetically by label and tracks by library order', () => {
  it('orders outer/inner rows by label and tracks by trackOrder, unknown last', () => {
    const ledgers = [
      ledger('aaaa', 'bbbb', tg01.id, []),
      ledger('aaaa', 'bbbb', 'zzzz', []),
      ledger('aaaa', 'bbbb', rp01.id, []),
      ledger('aaaa', 'cccc', rp01.id, []),
    ];

    const rows = groupRelationships(ledgers, 'holder', { resolveTrack, trackOrder, labelFor });

    // aaaa = 'Zara', bbbb = 'anna', cccc = 'Mira' -> case-insensitive: anna, Mira, Zara
    expect(rows[0].entityId).toBe('aaaa'); // only outer row here
    const innerOrder = rows[0].children.map((c) => c.entityId);
    // bbbb -> 'anna', cccc -> 'Mira' -> alphabetical (case-insensitive): anna, Mira
    expect(innerOrder).toEqual(['bbbb', 'cccc']);

    const bbbbTracks = rows[0].children.find((c) => c.entityId === 'bbbb')!.tracks;
    expect(bbbbTracks.map((t) => t.trackId)).toEqual([rp01.id, tg01.id, 'zzzz']);
  });

  it('orders multiple outer rows by label, case-insensitively', () => {
    const ledgers = [
      ledger('bbbb', 'aaaa', rp01.id, []),
      ledger('aaaa', 'aaaa', rp01.id, []),
      ledger('cccc', 'aaaa', rp01.id, []),
    ];
    const rows = groupRelationships(ledgers, 'holder', { resolveTrack, trackOrder, labelFor });
    // labels: bbbb -> anna, cccc -> Mira, aaaa -> Zara => order: bbbb, cccc, aaaa
    expect(rows.map((r) => r.entityId)).toEqual(['bbbb', 'cccc', 'aaaa']);
  });
});
