import { describe, it, expect, vi, beforeEach } from 'vitest';

const setDefaultHolder = vi.fn().mockResolvedValue(undefined);
const getLedgers = vi.fn();
vi.mock('../data', () => ({
  relationshipsData: {
    setDefaultHolder: (...args: unknown[]) => setDefaultHolder(...args),
    addOption: vi.fn(),
    getLedgers: (...args: unknown[]) => getLedgers(...args),
  },
}));

import { makeHeldTagsResolver } from '../editor-host-config';
import {
  relationshipTagsSpec,
  type Ledger,
  type TrackLibrary,
} from '../../../shared/relationships';

const LIBRARY: TrackLibrary = { custom: [], optionAdditions: {} };

describe('makeHeldTagsResolver', () => {
  const trackId = relationshipTagsSpec.id;

  function ledger(observer: string, deltas: Ledger['deltas']): Ledger {
    return { holder: 'haaa', observer, track: trackId, deltas };
  }

  beforeEach(() => {
    getLedgers.mockReset();
  });

  it('fetches lazily via relationshipsData.getLedgers(holder, "holder") and folds every observer', async () => {
    getLedgers.mockResolvedValue([
      ledger('oaaa', [
        { op: 'add', key: 'member', at: null, declaredIn: { path: 'notes/a.md', ordinal: 0 } },
        { op: 'add', key: 'employee', at: null, declaredIn: { path: 'notes/a.md', ordinal: 1 } },
      ]),
    ]);
    const resolver = makeHeldTagsResolver({
      library: LIBRARY,
      currentPath: () => 'events/other.md',
      at: () => 100,
    });

    const result = await resolver({ trackId, holder: 'haaa', anchor: 0, doc: '' });
    expect(getLedgers).toHaveBeenCalledWith('haaa', 'holder');
    expect(result.get('oaaa')).toEqual(['member', 'employee']);
  });

  it('returns an empty map when unsaved (no current path) — Remove is event-only', async () => {
    const resolver = makeHeldTagsResolver({
      library: LIBRARY,
      currentPath: () => null,
      at: () => 100,
    });
    const result = await resolver({ trackId, holder: 'haaa', anchor: 0, doc: '' });
    expect(result.size).toBe(0);
    expect(getLedgers).not.toHaveBeenCalled();
  });

  it("re-derives the current file's deltas from the buffer instead of the saved snapshot", async () => {
    getLedgers.mockResolvedValue([
      ledger('oaaa', [
        // Saved state of this same file: only 'member'.
        { op: 'add', key: 'member', at: 100, declaredIn: { path: 'events/e.md', ordinal: 0 } },
      ]),
    ]);
    // The buffer now also adds 'employee' — an unsaved edit above the one being edited.
    const doc =
      '{{tg01.gains {holder:[[haaa]]} is now {option:employee} with {observer:[[oaaa]]} — {reason:}}}\n' +
      '{{tg01.gains {holder:[[haaa]]} is now {option:member} with {observer:[[oaaa]]} — {reason:}}}';
    const resolver = makeHeldTagsResolver({
      library: LIBRARY,
      currentPath: () => 'events/e.md',
      at: () => 100,
    });

    const anchor = doc.indexOf('{{tg01.gains {holder:[[haaa]]} is now {option:member}');
    const result = await resolver({ trackId, holder: 'haaa', anchor, doc });

    expect(result.get('oaaa')).toEqual(['employee']); // saved 'member' dropped; buffer's 'member' excluded (being edited)
  });

  it('includes a mirrored tag from a mutual option declared elsewhere in the SAME buffer', async () => {
    getLedgers.mockResolvedValue([]);
    const doc = [
      '{{tg01.gains {holder:[[oaaa]]} is now {option:married} with {observer:[[haaa]]} — {reason:}}}',
      '{{tg01.loses {holder:[[haaa]]} is now {option:} with {observer:[[oaaa]]} — {reason:}}}',
    ].join('\n');
    const resolver = makeHeldTagsResolver({
      library: LIBRARY,
      currentPath: () => 'events/e.md',
      at: () => 100,
    });

    // The 'loses' directive's tag blank: holder haaa — its held options must
    // include the mirror of the 'married' the OTHER directive gave (oaaa, haaa).
    const anchor = doc.indexOf('{{tg01.loses');
    const result = await resolver({ trackId, holder: 'haaa', anchor, doc });

    expect(result.get('oaaa')).toEqual(['married']);
  });
});
