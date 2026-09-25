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

import { makeHolderChosenHandler, makeHeldOptionsResolver } from '../editor-host-config';
import {
  relationshipTagsSpec,
  type Ledger,
  type TrackLibrary,
} from '../../../shared/relationships';

const LIBRARY: TrackLibrary = { custom: [], optionAdditions: {} };

describe('makeHolderChosenHandler', () => {
  beforeEach(() => {
    setDefaultHolder.mockClear();
  });

  it('offers to make the chosen holder the default; yes saves it', async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    const labelFor = (id: string) => (id === 'npc-1' ? 'Sera' : id);
    const handler = makeHolderChosenHandler(confirm, labelFor);

    handler('npc-1');
    await Promise.resolve();
    await Promise.resolve();

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Make Sera the default reputation holder?' }),
    );
    expect(setDefaultHolder).toHaveBeenCalledWith('npc-1');
  });

  it('does not save when the user declines', async () => {
    const confirm = vi.fn().mockResolvedValue(false);
    const handler = makeHolderChosenHandler(confirm, (id) => id);

    handler('npc-1');
    await Promise.resolve();
    await Promise.resolve();

    expect(setDefaultHolder).not.toHaveBeenCalled();
  });
});

describe('makeHeldOptionsResolver', () => {
  const trackId = relationshipTagsSpec.id;

  function ledger(deltas: Ledger['deltas']): Ledger {
    return { holder: 'haaa', observer: 'oaaa', track: trackId, deltas };
  }

  beforeEach(() => {
    getLedgers.mockReset();
  });

  it('fetches lazily via relationshipsData.getLedgers(holder, "holder") and folds the saved ledger', async () => {
    getLedgers.mockResolvedValue([
      ledger([
        { op: 'add', key: 'member', at: null, declaredIn: { path: 'notes/a.md', ordinal: 0 } },
        { op: 'add', key: 'employee', at: null, declaredIn: { path: 'notes/a.md', ordinal: 1 } },
      ]),
    ]);
    const resolver = makeHeldOptionsResolver({
      library: LIBRARY,
      currentPath: () => 'events/other.md',
      at: () => 100,
    });

    const result = await resolver({
      trackId,
      holder: 'haaa',
      observer: 'oaaa',
      anchor: 0,
      doc: '',
    });
    expect(getLedgers).toHaveBeenCalledWith('haaa', 'holder');
    expect(result).toEqual(['member', 'employee']);
  });

  it('returns empty when holder or observer is missing', async () => {
    const resolver = makeHeldOptionsResolver({
      library: LIBRARY,
      currentPath: () => 'events/a.md',
      at: () => null,
    });
    expect(await resolver({ trackId, holder: null, observer: 'oaaa', anchor: 0, doc: '' })).toEqual(
      [],
    );
    expect(getLedgers).not.toHaveBeenCalled();
  });

  it('returns empty when unsaved (no current path) — Remove is event-only', async () => {
    const resolver = makeHeldOptionsResolver({
      library: LIBRARY,
      currentPath: () => null,
      at: () => 100,
    });
    expect(
      await resolver({ trackId, holder: 'haaa', observer: 'oaaa', anchor: 0, doc: '' }),
    ).toEqual([]);
    expect(getLedgers).not.toHaveBeenCalled();
  });

  it("re-derives the current file's deltas from the buffer instead of the saved snapshot", async () => {
    getLedgers.mockResolvedValue([
      ledger([
        // Saved state of this same file: only 'member'.
        { op: 'add', key: 'member', at: 100, declaredIn: { path: 'events/e.md', ordinal: 0 } },
      ]),
    ]);
    // The buffer now also adds 'employee' — an unsaved edit above the one being edited.
    const doc =
      '{{tg01.gains {holder:[[haaa]]} is now {option:employee} with {observer:[[oaaa]]} — {reason:}}}\n' +
      '{{tg01.gains {holder:[[haaa]]} is now {option:member} with {observer:[[oaaa]]} — {reason:}}}';
    const resolver = makeHeldOptionsResolver({
      library: LIBRARY,
      currentPath: () => 'events/e.md',
      at: () => 100,
    });

    const anchor = doc.indexOf('{{tg01.gains {holder:[[haaa]]} is now {option:member}');
    const result = await resolver({ trackId, holder: 'haaa', observer: 'oaaa', anchor, doc });

    expect(result).toEqual(['employee']); // saved 'member' dropped; buffer's 'member' excluded (being edited)
  });
});
