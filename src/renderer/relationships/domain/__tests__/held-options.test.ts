import { describe, it, expect } from 'vitest';
import {
  resolveTrackSpec,
  relationshipTagsSpec,
  EMPTY_TRACK_LIBRARY,
  type Ledger,
  type TrackLibrary,
} from '../../../../shared/relationships';
import { heldTagsByObserver, observersHolding, unionHeldOptions } from '../held-options';

const track = resolveTrackSpec(relationshipTagsSpec);
const trackId = relationshipTagsSpec.id;
const LIBRARY: TrackLibrary = EMPTY_TRACK_LIBRARY;

function ledger(holder: string, observer: string, deltas: Ledger['deltas']): Ledger {
  return { holder, observer, track: trackId, deltas };
}

function gains(holder: string, option: string, observer: string): string {
  return `{{${trackId}.gains {holder:[[${holder}]]} is now {option:${option}} with {observer:[[${observer}]]} — {reason:}}}`;
}

function loses(holder: string, option: string, observer: string): string {
  return `{{${trackId}.loses {holder:[[${holder}]]} is now {option:${option}} with {observer:[[${observer}]]} — {reason:}}}`;
}

describe('heldTagsByObserver', () => {
  it('with no observer picked, unions tags held with every observer at the event date', () => {
    const ledgers: Ledger[] = [
      ledger('haaa', 'oaaa', [
        { op: 'add', key: 'member', at: 50, declaredIn: { path: 'events/a.md', ordinal: 0 } },
      ]),
      ledger('haaa', 'obbb', [
        { op: 'add', key: 'hates', at: 50, declaredIn: { path: 'events/b.md', ordinal: 0 } },
      ]),
    ];

    const byObserver = heldTagsByObserver({
      holder: 'haaa',
      track,
      library: LIBRARY,
      ledgers,
      doc: '',
      path: 'events/e.md',
      at: 100,
    });

    expect(unionHeldOptions(byObserver).sort()).toEqual(['hates', 'member']);
  });

  it('with an observer filled, narrows to just that pair', () => {
    const ledgers: Ledger[] = [
      ledger('haaa', 'oaaa', [
        { op: 'add', key: 'member', at: 50, declaredIn: { path: 'events/a.md', ordinal: 0 } },
      ]),
      ledger('haaa', 'obbb', [
        { op: 'add', key: 'hates', at: 50, declaredIn: { path: 'events/b.md', ordinal: 0 } },
      ]),
    ];

    const byObserver = heldTagsByObserver({
      holder: 'haaa',
      track,
      library: LIBRARY,
      ledgers,
      doc: '',
      path: 'events/e.md',
      at: 100,
    });

    expect(byObserver.get('oaaa')).toEqual(['member']);
    expect(byObserver.get('obbb')).toEqual(['hates']);
  });

  it('observer step: returns only notes where (holder, observer) holds the chosen tag', () => {
    const ledgers: Ledger[] = [
      ledger('haaa', 'oaaa', [
        { op: 'add', key: 'member', at: 50, declaredIn: { path: 'events/a.md', ordinal: 0 } },
      ]),
      ledger('haaa', 'obbb', [
        { op: 'add', key: 'hates', at: 50, declaredIn: { path: 'events/b.md', ordinal: 0 } },
      ]),
    ];

    const byObserver = heldTagsByObserver({
      holder: 'haaa',
      track,
      library: LIBRARY,
      ledgers,
      doc: '',
      path: 'events/e.md',
      at: 100,
    });

    expect(observersHolding(byObserver, 'member')).toEqual(['oaaa']);
    expect(observersHolding(byObserver, 'hates')).toEqual(['obbb']);
    expect(observersHolding(byObserver, 'nope')).toEqual([]);
  });

  it('unsaved earlier directives in this file count, including mirrors from a Symmetrical tag', () => {
    // haaa gives oaaa 'married' (mutual) — mirrors onto (oaaa, haaa). A
    // Remove for (oaaa -> haaa) — i.e. removing oaaa's relationship with
    // haaa — must see 'married' as held, even though it was never declared
    // directly on that ledger.
    const doc = [gains('haaa', 'married', 'oaaa'), loses('oaaa', 'married', 'haaa')].join('\n');
    const editedOrdinal = 1; // the 'loses' directive being edited

    const byObserver = heldTagsByObserver({
      holder: 'oaaa',
      track,
      library: LIBRARY,
      ledgers: [],
      doc,
      path: 'events/e.md',
      at: 100,
      excludeOrdinal: editedOrdinal,
    });

    expect(byObserver.get('haaa')).toEqual(['married']);
  });

  it('a non-mutual option is never mirrored', () => {
    const doc = gains('haaa', 'member', 'oaaa');

    const byObserver = heldTagsByObserver({
      holder: 'oaaa',
      track,
      library: LIBRARY,
      ledgers: [],
      doc,
      path: 'events/e.md',
      at: 100,
    });

    expect(byObserver.get('haaa') ?? []).toEqual([]);
  });

  it('excludes the edited directive (direct and mirrored) from every observer it touches', () => {
    // A mutual tag given to oaaa, then a loses directive (being edited) for
    // a *different* observer — the loses directive's own (unfilled) blank
    // must not itself count as "holding" anything, and the mirror from the
    // gains directive must still show up.
    const doc = [gains('haaa', 'married', 'oaaa'), loses('haaa', 'member', 'obbb')].join('\n');

    const byObserver = heldTagsByObserver({
      holder: 'haaa',
      track,
      library: LIBRARY,
      ledgers: [],
      doc,
      path: 'events/e.md',
      at: 100,
      excludeOrdinal: 1,
    });

    expect(unionHeldOptions(byObserver)).toEqual(['married']);
  });

  it("drops the saved ledger's deltas for the current file and replaces them with the buffer's own", () => {
    const ledgers: Ledger[] = [
      ledger('haaa', 'oaaa', [
        { op: 'add', key: 'member', at: 100, declaredIn: { path: 'events/e.md', ordinal: 0 } },
      ]),
    ];
    // Unsaved edit: an extra directive above the saved one, adding 'employee'.
    const doc = [gains('haaa', 'employee', 'oaaa'), gains('haaa', 'member', 'oaaa')].join('\n');

    const byObserver = heldTagsByObserver({
      holder: 'haaa',
      track,
      library: LIBRARY,
      ledgers,
      doc,
      path: 'events/e.md',
      at: 100,
    });

    expect(byObserver.get('oaaa')?.sort()).toEqual(['employee', 'member']);
  });

  it('later-dated deltas (outside this file) are ignored', () => {
    const ledgers: Ledger[] = [
      ledger('haaa', 'oaaa', [
        { op: 'add', key: 'member', at: 999, declaredIn: { path: 'events/future.md', ordinal: 0 } },
      ]),
    ];

    const byObserver = heldTagsByObserver({
      holder: 'haaa',
      track,
      library: LIBRARY,
      ledgers,
      doc: '',
      path: 'events/e.md',
      at: 100,
    });

    expect(unionHeldOptions(byObserver)).toEqual([]);
  });

  it('includes an observer only declared in the current buffer, with no saved ledger yet', () => {
    const doc = gains('haaa', 'employee', 'oaaa');

    const byObserver = heldTagsByObserver({
      holder: 'haaa',
      track,
      library: LIBRARY,
      ledgers: [],
      doc,
      path: 'events/e.md',
      at: 100,
    });

    expect(unionHeldOptions(byObserver)).toEqual(['employee']);
  });
});
