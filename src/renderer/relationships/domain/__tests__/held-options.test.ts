import { describe, it, expect } from 'vitest';
import {
  resolveTrackSpec,
  relationshipTagsSpec,
  type Ledger,
} from '../../../../shared/relationships';
import { heldOptionsAt } from '../held-options';

const track = resolveTrackSpec(relationshipTagsSpec);

function ledger(deltas: Ledger['deltas']): Ledger {
  return { holder: 'h1', observer: 'o1', track: relationshipTagsSpec.id, deltas };
}

describe('heldOptionsAt', () => {
  it('held options as of an event date exclude later changes and the directive itself', () => {
    const l = ledger([
      { op: 'add', key: 'member', at: 100, declaredIn: { path: 'events/a.md', ordinal: 0 } },
      { op: 'add', key: 'employee', at: 200, declaredIn: { path: 'events/b.md', ordinal: 0 } },
      // The directive currently being edited, at the same date as the query.
      { op: 'add', key: 'customer', at: 200, declaredIn: { path: 'events/b.md', ordinal: 1 } },
      { op: 'add', key: 'hates', at: 300, declaredIn: { path: 'events/c.md', ordinal: 0 } },
    ]);

    const result = heldOptionsAt(l, track, 200, { path: 'events/b.md', ordinal: 1 });

    expect(result).toEqual(['member', 'employee']);
  });

  it('held options in a note use only the undated baseline', () => {
    const l = ledger([
      { op: 'add', key: 'member', at: null, declaredIn: { path: 'notes/a.md', ordinal: 0 } },
      { op: 'add', key: 'employee', at: 100, declaredIn: { path: 'events/x.md', ordinal: 0 } },
      { op: 'add', key: 'customer', at: null, declaredIn: { path: 'notes/b.md', ordinal: 0 } },
    ]);

    const result = heldOptionsAt(l, track, null);

    expect(result).toEqual(['member', 'customer']);
  });
});
