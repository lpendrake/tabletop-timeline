import { describe, it, expect } from 'vitest';
import {
  resolveTrackSpec,
  relationshipTagsSpec,
  EMPTY_TRACK_LIBRARY,
  type Ledger,
  type TrackLibrary,
} from '../../../../shared/relationships';
import {
  heldOptionsAt,
  heldOptionsByObserver,
  heldOptionsForBuffer,
  observersHolding,
  unionHeldOptions,
} from '../held-options';

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

describe('heldOptionsAt', () => {
  it('folds the given deltas as of `at` via computeValue', () => {
    const l = ledger('haaa', 'oaaa', []);
    const deltas: Ledger['deltas'] = [
      { op: 'add', key: 'member', at: 100, declaredIn: { path: 'a.md', ordinal: 0 } },
      { op: 'add', key: 'hates', at: 300, declaredIn: { path: 'a.md', ordinal: 1 } },
    ];
    expect(heldOptionsAt(l, track, 200, deltas)).toEqual(['member']);
  });

  it('treats null `at` as -Infinity (the undated baseline)', () => {
    const l = ledger('haaa', 'oaaa', []);
    const deltas: Ledger['deltas'] = [
      { op: 'add', key: 'member', at: null, declaredIn: { path: 'a.md', ordinal: 0 } },
      { op: 'add', key: 'employee', at: 5, declaredIn: { path: 'a.md', ordinal: 1 } },
    ];
    expect(heldOptionsAt(l, track, null, deltas)).toEqual(['member']);
  });
});

describe('heldOptionsForBuffer', () => {
  it("drops the saved ledger's deltas for the current file and replaces them with the buffer's own", () => {
    const l = ledger('haaa', 'oaaa', [
      { op: 'add', key: 'member', at: 100, declaredIn: { path: 'events/e.md', ordinal: 0 } },
    ]);
    // Unsaved edit: an extra directive above the saved one, adding 'employee'.
    const doc = [gains('haaa', 'employee', 'oaaa'), gains('haaa', 'member', 'oaaa')].join('\n');

    const result = heldOptionsForBuffer({
      ledger: l,
      track,
      library: LIBRARY,
      doc,
      path: 'events/e.md',
      at: 100,
    });

    expect(result.sort()).toEqual(['employee', 'member']);
  });

  it('excludes the directive currently being edited (direct and mirrored deltas)', () => {
    const l = ledger('haaa', 'oaaa', []);
    const doc = [gains('haaa', 'employee', 'oaaa'), gains('haaa', 'member', 'oaaa')].join('\n');

    // The second directive (ordinal 1, "member") is the one being edited.
    const result = heldOptionsForBuffer({
      ledger: l,
      track,
      library: LIBRARY,
      doc,
      path: 'events/e.md',
      at: 100,
      excludeOrdinal: 1,
    });

    expect(result).toEqual(['employee']);
  });

  it('ignores deltas dated later than the given `at`, from either the saved ledger or the buffer', () => {
    const l = ledger('haaa', 'oaaa', [
      {
        op: 'add',
        key: 'from-other-file',
        at: 50,
        declaredIn: { path: 'events/other.md', ordinal: 0 },
      },
    ]);
    const doc = gains('haaa', 'member', 'oaaa');

    const result = heldOptionsForBuffer({
      ledger: l,
      track,
      library: LIBRARY,
      doc,
      path: 'events/e.md',
      at: 10, // before both 'from-other-file' (50) and the buffer directive (10, applied)
    });

    expect(result).toEqual(['member']); // dated exactly at `at` still applies; the later one doesn't
  });

  it('includes a mirrored delta from a mutual option declared on the SAME event, for the paired (observer, holder) ledger (bug: previously missed)', () => {
    // haaa gives oaaa 'married' (mutual) — mirrors onto (oaaa, haaa). A
    // Remove for (oaaa, haaa) — i.e. removing oaaa's relationship with
    // haaa — must see 'married' as held, even though it was never declared
    // directly on that ledger.
    const l = ledger('oaaa', 'haaa', []);
    const doc = [gains('haaa', 'married', 'oaaa'), loses('oaaa', 'married', 'haaa')].join('\n');
    const editedOrdinal = 1; // the 'loses' directive being edited

    const result = heldOptionsForBuffer({
      ledger: l,
      track,
      library: LIBRARY,
      doc,
      path: 'events/e.md',
      at: 100,
      excludeOrdinal: editedOrdinal,
    });

    expect(result).toEqual(['married']);
  });

  it('a non-mutual option is never mirrored', () => {
    const l = ledger('oaaa', 'haaa', []);
    const doc = gains('haaa', 'member', 'oaaa');

    const result = heldOptionsForBuffer({
      ledger: l,
      track,
      library: LIBRARY,
      doc,
      path: 'events/e.md',
      at: 100,
    });

    expect(result).toEqual([]);
  });
});

describe('heldOptionsByObserver / unionHeldOptions — the tag-first Remove step', () => {
  it("unions tags held with every observer on the track, across all of the holder's ledgers", () => {
    const ledgers: Ledger[] = [
      ledger('haaa', 'oaaa', [
        { op: 'add', key: 'member', at: 50, declaredIn: { path: 'events/a.md', ordinal: 0 } },
      ]),
      ledger('haaa', 'obbb', [
        { op: 'add', key: 'hates', at: 50, declaredIn: { path: 'events/b.md', ordinal: 0 } },
      ]),
    ];

    const byObserver = heldOptionsByObserver({
      holder: 'haaa',
      trackId,
      track,
      library: LIBRARY,
      ledgers,
      doc: '',
      path: 'events/e.md',
      at: 100,
    });

    expect(unionHeldOptions(byObserver).sort()).toEqual(['hates', 'member']);
  });

  it('includes an observer only declared in the current buffer, with no saved ledger yet', () => {
    const doc = gains('haaa', 'employee', 'oaaa');

    const byObserver = heldOptionsByObserver({
      holder: 'haaa',
      trackId,
      track,
      library: LIBRARY,
      ledgers: [],
      doc,
      path: 'events/e.md',
      at: 100,
    });

    expect(unionHeldOptions(byObserver)).toEqual(['employee']);
  });

  it('excludes the directive being edited (direct and mirrored) from every observer it touches', () => {
    // A mutual tag given to oaaa, then a loses directive (being edited) for
    // a *different* observer — the loses directive's own (unfilled) blank
    // must not itself count as "holding" anything, and the mirror from the
    // gains directive must still show up.
    const doc = [gains('haaa', 'married', 'oaaa'), loses('haaa', 'member', 'obbb')].join('\n');

    const byObserver = heldOptionsByObserver({
      holder: 'haaa',
      trackId,
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

  it('later-dated deltas (outside this file) are ignored', () => {
    const ledgers: Ledger[] = [
      ledger('haaa', 'oaaa', [
        { op: 'add', key: 'member', at: 999, declaredIn: { path: 'events/future.md', ordinal: 0 } },
      ]),
    ];

    const byObserver = heldOptionsByObserver({
      holder: 'haaa',
      trackId,
      track,
      library: LIBRARY,
      ledgers,
      doc: '',
      path: 'events/e.md',
      at: 100,
    });

    expect(unionHeldOptions(byObserver)).toEqual([]);
  });
});

describe('observersHolding — the observer-step Remove blank', () => {
  it('returns only the observers whose held options include the chosen tag', () => {
    const ledgers: Ledger[] = [
      ledger('haaa', 'oaaa', [
        { op: 'add', key: 'member', at: 50, declaredIn: { path: 'events/a.md', ordinal: 0 } },
      ]),
      ledger('haaa', 'obbb', [
        { op: 'add', key: 'hates', at: 50, declaredIn: { path: 'events/b.md', ordinal: 0 } },
      ]),
    ];

    const byObserver = heldOptionsByObserver({
      holder: 'haaa',
      trackId,
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

  it('the out-of-order fallback: a single (holder, observer) ledger folded directly via heldOptionsForBuffer, once the observer is already known', () => {
    const l = ledger('haaa', 'oaaa', [
      { op: 'add', key: 'member', at: 50, declaredIn: { path: 'events/a.md', ordinal: 0 } },
    ]);

    const result = heldOptionsForBuffer({
      ledger: l,
      track,
      library: LIBRARY,
      doc: '',
      path: 'events/e.md',
      at: 100,
    });

    expect(result).toEqual(['member']);
  });
});
