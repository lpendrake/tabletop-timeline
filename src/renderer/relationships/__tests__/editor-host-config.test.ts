import { describe, it, expect, vi, beforeEach } from 'vitest';

const setDefaultHolder = vi.fn().mockResolvedValue(undefined);
vi.mock('../data', () => ({
  relationshipsData: {
    setDefaultHolder: (...args: unknown[]) => setDefaultHolder(...args),
    addOption: vi.fn(),
  },
}));

import {
  buildRelationshipEditorConfig,
  makeHeldTagsResolver,
  makeTrackUsageResolver,
} from '../editor-host-config';
import {
  relationshipTagsSpec,
  type Ledger,
  type TrackLibrary,
} from '../../../shared/relationships';

const LIBRARY: TrackLibrary = { custom: [], optionAdditions: {} };

describe('makeHeldTagsResolver', () => {
  const trackId = relationshipTagsSpec.id;
  const ledgers = vi.fn<() => Promise<Ledger[]>>();

  function ledger(observer: string, deltas: Ledger['deltas']): Ledger {
    return { holder: 'haaa', observer, track: trackId, deltas };
  }

  beforeEach(() => {
    ledgers.mockReset();
  });

  it('folds every observer of the holder using the injected ledgers', async () => {
    ledgers.mockResolvedValue([
      ledger('oaaa', [
        { op: 'add', key: 'member', at: null, declaredIn: { path: 'notes/a.md', ordinal: 0 } },
        { op: 'add', key: 'employee', at: null, declaredIn: { path: 'notes/a.md', ordinal: 1 } },
      ]),
    ]);
    const resolver = makeHeldTagsResolver({
      library: LIBRARY,
      ledgers,
      currentPath: () => 'events/other.md',
      at: () => 100,
    });

    const result = await resolver({ trackId, holder: 'haaa', anchor: 0, doc: '' });
    expect(ledgers).toHaveBeenCalledTimes(1);
    expect(result.get('oaaa')).toEqual(['member', 'employee']);
  });

  it("heldTags reads only the holder's ledgers", async () => {
    ledgers.mockResolvedValue([
      ledger('oaaa', [
        { op: 'add', key: 'member', at: null, declaredIn: { path: 'notes/a.md', ordinal: 0 } },
      ]),
      {
        holder: 'hbbb',
        observer: 'ocase',
        track: trackId,
        deltas: [
          { op: 'add', key: 'rival', at: null, declaredIn: { path: 'notes/b.md', ordinal: 0 } },
        ],
      },
    ]);
    const resolver = makeHeldTagsResolver({
      library: LIBRARY,
      ledgers,
      currentPath: () => 'events/other.md',
      at: () => 100,
    });

    const result = await resolver({ trackId, holder: 'haaa', anchor: 0, doc: '' });
    expect(result.get('oaaa')).toEqual(['member']);
    expect(result.has('ocase')).toBe(false);
  });

  it('returns an empty map when unsaved (no current path) — Remove is event-only', async () => {
    const resolver = makeHeldTagsResolver({
      library: LIBRARY,
      ledgers,
      currentPath: () => null,
      at: () => 100,
    });
    const result = await resolver({ trackId, holder: 'haaa', anchor: 0, doc: '' });
    expect(result.size).toBe(0);
    expect(ledgers).not.toHaveBeenCalled();
  });

  it("re-derives the current file's deltas from the buffer instead of the saved snapshot", async () => {
    ledgers.mockResolvedValue([
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
      ledgers,
      currentPath: () => 'events/e.md',
      at: () => 100,
    });

    const anchor = doc.indexOf('{{tg01.gains {holder:[[haaa]]} is now {option:member}');
    const result = await resolver({ trackId, holder: 'haaa', anchor, doc });

    expect(result.get('oaaa')).toEqual(['employee']); // saved 'member' dropped; buffer's 'member' excluded (being edited)
  });

  it('includes a mirrored tag from a mutual option declared elsewhere in the SAME buffer', async () => {
    ledgers.mockResolvedValue([]);
    const doc = [
      '{{tg01.gains {holder:[[oaaa]]} is now {option:married} with {observer:[[haaa]]} — {reason:}}}',
      '{{tg01.loses {holder:[[haaa]]} is now {option:} with {observer:[[oaaa]]} — {reason:}}}',
    ].join('\n');
    const resolver = makeHeldTagsResolver({
      library: LIBRARY,
      ledgers,
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

describe('makeTrackUsageResolver', () => {
  const trackId = relationshipTagsSpec.id;
  const DAY = 86400;
  const ledgers = vi.fn<() => Promise<Ledger[]>>();

  function ledger(holder: string, observer: string, deltas: Ledger['deltas']): Ledger {
    return { holder, observer, track: trackId, deltas };
  }

  function add(
    key: string,
    at: number | null,
    path: string,
    ordinal: number,
  ): Ledger['deltas'][number] {
    return { op: 'add', key, at, declaredIn: { path, ordinal } };
  }

  beforeEach(() => {
    ledgers.mockReset();
  });

  it('trackUsage reads the injected ledgers only when called', async () => {
    ledgers.mockResolvedValue([]);
    const resolver = makeTrackUsageResolver({
      library: LIBRARY,
      ledgers,
      currentPath: () => 'events/other.md',
      at: () => DAY,
      place: 'event',
    });
    expect(ledgers).not.toHaveBeenCalled();

    await resolver({ trackId, anchor: 0, doc: '' });
    expect(ledgers).toHaveBeenCalledTimes(1);
  });

  it('trackUsage returns used notes with proximity to the event date', async () => {
    ledgers.mockResolvedValue([
      // Holder haaa is used at day 1 (nearest to day 2) and day 10.
      ledger('haaa', 'oaaa', [
        add('member', DAY, 'events/a.md', 0),
        add('employee', 10 * DAY, 'events/b.md', 0),
      ]),
      ledger('haaa', 'obbb', [add('member', 10 * DAY, 'events/b.md', 1)]),
    ]);
    const resolver = makeTrackUsageResolver({
      library: LIBRARY,
      ledgers,
      currentPath: () => 'events/other.md',
      at: () => 2 * DAY,
      place: 'event',
    });

    const result = await resolver({ trackId, anchor: 0, doc: '' });
    expect(result).toEqual(
      new Map<string, number | null>([
        ['haaa', DAY],
        ['oaaa', DAY],
        ['obbb', 8 * DAY],
      ]),
    );
  });

  it('trackUsage excludes the directive at the anchor', async () => {
    ledgers.mockResolvedValue([]);
    const doc = [
      '{{tg01.gains {holder:[[haaa]]} is now {option:member} with {observer:[[oaaa]]} — {reason:}}}',
      '{{tg01.gains {holder:[[haaa]]} is now {option:married} with {observer:[[obbb]]} — {reason:}}}',
    ].join('\n');
    const resolver = makeTrackUsageResolver({
      library: LIBRARY,
      ledgers,
      currentPath: () => 'events/e.md',
      at: () => DAY,
      place: 'event',
    });

    const anchor = doc.indexOf('{{tg01.gains {holder:[[haaa]]} is now {option:married}');
    const result = await resolver({ trackId, anchor, doc });

    expect(result.has('oaaa')).toBe(true);
    expect(result.has('obbb')).toBe(false);
  });

  it('trackUsage still works for an unsaved buffer', async () => {
    ledgers.mockResolvedValue([ledger('haaa', 'oaaa', [add('member', DAY, 'events/a.md', 0)])]);
    // A buffer directive on the same track, with its blank at -1 (not this directive's `from`).
    const doc =
      '{{tg01.gains {holder:[[haaa]]} is now {option:married} with {observer:[[obbb]]} — {reason:}}}';
    const resolver = makeTrackUsageResolver({
      library: LIBRARY,
      ledgers,
      currentPath: () => null,
      at: () => 3 * DAY,
      place: 'event',
    });

    const result = await resolver({ trackId, anchor: -1, doc });
    // Saved ledger: haaa and oaaa used at day 1 (2 days away). Buffer: haaa and obbb at day 3 (on the date).
    expect(result).toEqual(
      new Map<string, number | null>([
        ['haaa', 0],
        ['oaaa', 2 * DAY],
        ['obbb', 0],
      ]),
    );
  });

  it('trackUsage returns an empty map for an unknown track', async () => {
    const resolver = makeTrackUsageResolver({
      library: LIBRARY,
      ledgers,
      currentPath: () => 'events/e.md',
      at: () => DAY,
      place: 'event',
    });

    const result = await resolver({ trackId: 'no-such-track', anchor: 0, doc: '' });
    expect(result.size).toBe(0);
    expect(ledgers).not.toHaveBeenCalled();
  });
});

describe('buildRelationshipEditorConfig', () => {
  it('exposes trackUsage in choices', () => {
    const trackUsage = makeTrackUsageResolver({
      library: LIBRARY,
      ledgers: () => Promise.resolve([]),
      currentPath: () => 'events/e.md',
      at: () => null,
      place: 'note',
    });
    const config = buildRelationshipEditorConfig({
      library: LIBRARY,
      defaultReason: 'Unspecified',
      place: 'note',
      noteOptions: () => [],
      defaultHolderId: () => null,
      currentNoteId: () => null,
      trackUsage,
    });
    expect(config.choices?.trackUsage).toBe(trackUsage);
  });
});
