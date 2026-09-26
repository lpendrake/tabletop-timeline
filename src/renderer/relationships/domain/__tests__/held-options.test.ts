import { describe, it, expect } from 'vitest';
import {
  resolveTrackSpec,
  relationshipTagsSpec,
  EMPTY_TRACK_LIBRARY,
  type Ledger,
  type TrackLibrary,
} from '../../../../shared/relationships';
import { deltasFromBuffer, heldOptionsAt, heldOptionsForBuffer } from '../held-options';

const track = resolveTrackSpec(relationshipTagsSpec);
const trackId = relationshipTagsSpec.id;
const LIBRARY: TrackLibrary = EMPTY_TRACK_LIBRARY;

function ledger(deltas: Ledger['deltas']): Ledger {
  return { holder: 'haaa', observer: 'oaaa', track: trackId, deltas };
}

function gains(holder: string, option: string, observer: string): string {
  return `{{${trackId}.gains {holder:[[${holder}]]} is now {option:${option}} with {observer:[[${observer}]]} — {reason:}}}`;
}

describe('heldOptionsAt', () => {
  it('folds the given deltas as of `at` via computeValue', () => {
    const l = ledger([]);
    const deltas: Ledger['deltas'] = [
      { op: 'add', key: 'member', at: 100, declaredIn: { path: 'a.md', ordinal: 0 } },
      { op: 'add', key: 'hates', at: 300, declaredIn: { path: 'a.md', ordinal: 1 } },
    ];
    expect(heldOptionsAt(l, track, 200, deltas)).toEqual(['member']);
  });

  it('treats null `at` as -Infinity (the undated baseline)', () => {
    const l = ledger([]);
    const deltas: Ledger['deltas'] = [
      { op: 'add', key: 'member', at: null, declaredIn: { path: 'a.md', ordinal: 0 } },
      { op: 'add', key: 'employee', at: 5, declaredIn: { path: 'a.md', ordinal: 1 } },
    ];
    expect(heldOptionsAt(l, track, null, deltas)).toEqual(['member']);
  });
});

describe('deltasFromBuffer', () => {
  it("parses and interprets the buffer's own directives for the (holder, observer, track) ledger", () => {
    const doc = gains('haaa', 'member', 'oaaa');
    const deltas = deltasFromBuffer(doc, 'events/e.md', LIBRARY, 'haaa', 'oaaa', trackId, 100);
    expect(deltas).toEqual([
      { op: 'add', key: 'member', at: 100, declaredIn: { path: 'events/e.md', ordinal: 0 } },
    ]);
  });

  it('excludes the directive at `excludeOrdinal`', () => {
    const doc = [gains('haaa', 'member', 'oaaa'), gains('haaa', 'employee', 'oaaa')].join('\n');
    const deltas = deltasFromBuffer(doc, 'events/e.md', LIBRARY, 'haaa', 'oaaa', trackId, 100, 1);
    expect(deltas.map((d) => (d.op === 'add' ? d.key : null))).toEqual(['member']);
  });

  it('ignores directives for a different (holder, observer, track) ledger', () => {
    const doc = [gains('haaa', 'member', 'oaaa'), gains('hbbb', 'employee', 'oaaa')].join('\n');
    const deltas = deltasFromBuffer(doc, 'events/e.md', LIBRARY, 'haaa', 'oaaa', trackId, 100);
    expect(deltas.map((d) => (d.op === 'add' ? d.key : null))).toEqual(['member']);
  });

  it('dates every buffer delta at the given `at`, not per-directive', () => {
    const doc = gains('haaa', 'member', 'oaaa');
    const deltas = deltasFromBuffer(doc, 'events/e.md', LIBRARY, 'haaa', 'oaaa', trackId, 555);
    expect(deltas[0].at).toBe(555);
  });
});

describe('heldOptionsForBuffer', () => {
  it("drops the saved ledger's deltas for the current file and replaces them with the buffer's own", () => {
    const l = ledger([
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

  it('excludes the directive currently being edited', () => {
    const l = ledger([]);
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
    const l = ledger([
      {
        op: 'add',
        key: 'from-other-file',
        at: 50,
        declaredIn: { path: 'events/other.md', ordinal: 0 },
      },
    ]);
    // A directive in this same buffer, declared at the event's date — but a
    // later delta elsewhere on the ledger (from-other-file) is unaffected by
    // that; what matters here is that `at` still gates the fold overall.
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

  it('an unsaved directive above the edited one still contributes; a later-dated one does not', () => {
    // Three directives in one buffer: an unsaved 'employee' above the edited
    // 'member' directive, and a 'hates' directive that (if it had its own
    // later date) would be excluded by `at` — since the whole buffer is
    // dated at the event's single `at`, we model "later" via a second event
    // file's saved delta instead.
    const doc = [gains('haaa', 'employee', 'oaaa'), gains('haaa', 'member', 'oaaa')].join('\n');
    const savedLater: Ledger = ledger([
      { op: 'add', key: 'hates', at: 999, declaredIn: { path: 'events/future.md', ordinal: 0 } },
    ]);

    const result = heldOptionsForBuffer({
      ledger: savedLater,
      track,
      library: LIBRARY,
      doc,
      path: 'events/e.md',
      at: 100,
      excludeOrdinal: 1, // 'member' is the one being edited
    });

    expect(result).toEqual(['employee']); // 'hates' (999) not yet applied at 100; 'member' excluded
  });
});
