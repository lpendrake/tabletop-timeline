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

import {
  makeHolderChosenHandler,
  makeHeldOptionsResolver,
  makeObserverOptionsResolver,
} from '../editor-host-config';
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

  it('returns a promise that resolves only once the dialog is answered and (on yes) the save has completed', async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    const handler = makeHolderChosenHandler(confirm, (id) => id);

    await handler('npc-1');

    expect(setDefaultHolder).toHaveBeenCalledWith('npc-1');
  });

  it('resolves without saving when the dialog is declined', async () => {
    const confirm = vi.fn().mockResolvedValue(false);
    const handler = makeHolderChosenHandler(confirm, (id) => id);

    await expect(handler('npc-1')).resolves.toBeUndefined();
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

  it('returns empty when holder is missing', async () => {
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

  it('with no observer (the normal in-order fill), unions tags held with every observer on the track', async () => {
    getLedgers.mockResolvedValue([
      ledger([
        { op: 'add', key: 'member', at: null, declaredIn: { path: 'notes/a.md', ordinal: 0 } },
      ]),
      {
        holder: 'haaa',
        observer: 'obbb',
        track: trackId,
        deltas: [
          { op: 'add', key: 'hates', at: null, declaredIn: { path: 'notes/b.md', ordinal: 0 } },
        ],
      },
    ]);
    const resolver = makeHeldOptionsResolver({
      library: LIBRARY,
      currentPath: () => 'events/other.md',
      at: () => 100,
    });

    const result = await resolver({ trackId, holder: 'haaa', observer: null, anchor: 0, doc: '' });
    expect(getLedgers).toHaveBeenCalledWith('haaa', 'holder');
    expect(result.sort()).toEqual(['hates', 'member']);
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

  it('includes a mirrored tag from a mutual option declared elsewhere in the SAME buffer (bug: previously missed)', async () => {
    getLedgers.mockResolvedValue([]);
    const doc = [
      '{{tg01.gains {holder:[[oaaa]]} is now {option:married} with {observer:[[haaa]]} — {reason:}}}',
      '{{tg01.loses {holder:[[haaa]]} is now {option:} with {observer:[[oaaa]]} — {reason:}}}',
    ].join('\n');
    const resolver = makeHeldOptionsResolver({
      library: LIBRARY,
      currentPath: () => 'events/e.md',
      at: () => 100,
    });

    // The 'loses' directive's own tag blank: holder haaa, observer oaaa (already
    // filled out of order) — its held options must include the mirror of the
    // 'married' the OTHER directive gave (oaaa, haaa).
    const anchor = doc.indexOf('{{tg01.loses');
    const result = await resolver({ trackId, holder: 'haaa', observer: 'oaaa', anchor, doc });

    expect(result).toEqual(['married']);
  });
});

describe('makeObserverOptionsResolver', () => {
  const trackId = relationshipTagsSpec.id;

  function ledger(holder: string, observer: string, deltas: Ledger['deltas']): Ledger {
    return { holder, observer, track: trackId, deltas };
  }

  beforeEach(() => {
    getLedgers.mockReset();
  });

  it('restricts to observers holding the chosen tag with the holder', async () => {
    getLedgers.mockResolvedValue([
      ledger('haaa', 'oaaa', [
        { op: 'add', key: 'member', at: 50, declaredIn: { path: 'notes/a.md', ordinal: 0 } },
      ]),
      ledger('haaa', 'obbb', [
        { op: 'add', key: 'hates', at: 50, declaredIn: { path: 'notes/b.md', ordinal: 0 } },
      ]),
    ]);
    const resolver = makeObserverOptionsResolver({
      library: LIBRARY,
      currentPath: () => 'events/e.md',
      at: () => 100,
    });

    const result = await resolver({
      trackId,
      holder: 'haaa',
      option: 'member',
      anchor: 0,
      doc: '',
    });
    expect(getLedgers).toHaveBeenCalledWith('haaa', 'holder');
    expect(result).toEqual(['oaaa']);
  });

  it('returns empty when holder is missing', async () => {
    const resolver = makeObserverOptionsResolver({
      library: LIBRARY,
      currentPath: () => 'events/e.md',
      at: () => 100,
    });
    expect(await resolver({ trackId, holder: null, option: 'member', anchor: 0, doc: '' })).toEqual(
      [],
    );
    expect(getLedgers).not.toHaveBeenCalled();
  });

  it('returns empty when unsaved (no current path)', async () => {
    const resolver = makeObserverOptionsResolver({
      library: LIBRARY,
      currentPath: () => null,
      at: () => 100,
    });
    expect(
      await resolver({ trackId, holder: 'haaa', option: 'member', anchor: 0, doc: '' }),
    ).toEqual([]);
    expect(getLedgers).not.toHaveBeenCalled();
  });
});
