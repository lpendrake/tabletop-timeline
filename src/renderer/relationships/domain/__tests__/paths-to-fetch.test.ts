import { describe, it, expect } from 'vitest';
import {
  resolveTrackSpec,
  pf2eReputationSpec,
  type Ledger,
} from '../../../../shared/relationships';
import { groupRelationships } from '../group-relationships';
import { pathsNeededForExpandedTracks } from '../paths-to-fetch';

const rp01 = resolveTrackSpec(pf2eReputationSpec);
const resolveTrack = () => rp01;
const labelFor = (id: string) => id;

function ledger(holder: string, observer: string): Ledger {
  return {
    holder,
    observer,
    track: rp01.id,
    deltas: [
      {
        op: 'adjust',
        by: 5,
        at: 10,
        declaredIn: { path: `${holder}-${observer}.md`, ordinal: 0 },
      },
    ],
  };
}

describe('pathsNeededForExpandedTracks', () => {
  it('collects declaring paths only for rows the predicate marks expanded', () => {
    const ledgers = [ledger('aaaa', 'bbbb'), ledger('cccc', 'bbbb')];
    const rows = groupRelationships(ledgers, 'holder', {
      resolveTrack,
      trackOrder: [rp01.id],
      labelFor,
    });

    const expandedRow = rows[0].children[0].tracks[0];
    const paths = pathsNeededForExpandedTracks(rows, (row) => row.key === expandedRow.key, 100);

    expect(paths).toEqual([expandedRow.ledger.deltas[0].declaredIn.path]);
  });

  it('never collects paths for a collapsed row', () => {
    const ledgers = [ledger('aaaa', 'bbbb')];
    const rows = groupRelationships(ledgers, 'holder', {
      resolveTrack,
      trackOrder: [rp01.id],
      labelFor,
    });

    const paths = pathsNeededForExpandedTracks(rows, () => false, 100);

    expect(paths).toEqual([]);
  });
});
