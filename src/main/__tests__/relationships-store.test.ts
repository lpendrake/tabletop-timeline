import { describe, it, expect } from 'vitest';
import { compareDeltas } from '../../shared/relationships/index.js';
import type { CategoricalTrackSpec } from '../../shared/relationships/index.js';
import { RelationshipsStore } from '../relationships-store.js';
import type { RelationshipFileInput } from '../relationships-store.js';

const A = 'a1b2';
const C = 'c3d4';

function repChangeDirective(
  holder: string,
  observer: string,
  amount: number,
  reason: string,
): string {
  return `{{rp01.change Rep change: {amount:${amount}} {observer:[[${observer}]]} rep for {holder:[[${holder}]]} — {reason:${reason}}}}`;
}

/** Set (unlike Change/adjust) is allowed in a note — a note has no order. */
function repSetDirective(holder: string, observer: string, value: number, reason: string): string {
  return `{{rp01.set Rep set: {holder:[[${holder}]]}'s rep with {observer:[[${observer}]]} is {value:${value}} — {reason:${reason}}}}`;
}

function tagsGainsDirective(
  holder: string,
  observer: string,
  option: string,
  reason: string,
): string {
  return `{{tg01.gains {holder:[[${holder}]]} is now {option:${option}} with {observer:[[${observer}]]} — {reason:${reason}}}}`;
}

function tagsLosesDirective(
  holder: string,
  observer: string,
  option: string,
  reason: string,
): string {
  return `{{tg01.loses {holder:[[${holder}]]} is no longer {option:${option}} with {observer:[[${observer}]]} — {reason:${reason}}}}`;
}

function noteFile(path: string, source: string): RelationshipFileInput {
  return { path, source, title: 'Note', isEvent: false };
}

function eventFile(
  path: string,
  source: string,
  epochSeconds: number | null,
): RelationshipFileInput {
  return { path, source, title: 'Event', isEvent: true, epochSeconds };
}

function newStore(): RelationshipsStore {
  const store = new RelationshipsStore();
  store.seedKnownNotes([
    { path: 'notes/a.md', id: A },
    { path: 'notes/c.md', id: C },
    { path: 'notes/e.md', id: 'e5f6' },
    { path: 'notes/g.md', id: 'g7h8' },
  ]);
  return store;
}

/** Ledgers where `id` is the holder, the observer, or either. */
function ledgersOf(
  store: RelationshipsStore,
  id: string,
  as: 'holder' | 'observer' | 'both',
): ReturnType<RelationshipsStore['ledgers']> {
  return store
    .ledgers()
    .filter((l) =>
      as === 'holder'
        ? l.holder === id
        : as === 'observer'
          ? l.observer === id
          : l.holder === id || l.observer === id,
    );
}

describe('event directives get at from epochSeconds; note directives are undated', () => {
  it('assigns `at` from the event epochSeconds and null for a note directive', () => {
    const store = newStore();
    store.rebuild([
      eventFile('timeline/e1.md', repChangeDirective(A, C, -2, 'attacked'), 1000),
      noteFile('notes/n1.md', repSetDirective(C, A, 3, 'gift')),
    ]);

    const eventLedger = ledgersOf(store, A, 'holder')[0];
    expect(eventLedger.deltas).toHaveLength(1);
    expect(eventLedger.deltas[0].at).toBe(1000);

    const noteLedger = ledgersOf(store, C, 'holder')[0];
    expect(noteLedger.deltas).toHaveLength(1);
    expect(noteLedger.deltas[0].at).toBeNull();
  });
});

describe('an event with no date makes its directives errors', () => {
  it('produces no deltas and an "event has no date" invalid entry', () => {
    const store = newStore();
    store.rebuild([eventFile('timeline/e1.md', repChangeDirective(A, C, -2, 'attacked'), null)]);

    expect(store.ledgers()).toHaveLength(0);
    const invalid = store.invalid();
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toMatchObject({ path: 'timeline/e1.md', ordinal: 0 });
    expect(invalid[0].messages.join(' ')).toMatch(/no date/i);
  });
});

describe('unfinished directives are skipped silently', () => {
  it('produces no deltas and no invalid entry for a directive missing a required role', () => {
    const store = newStore();
    const source =
      "{{rp01.set Rep set: {holder:}'s rep with {observer:[[a1b2]]} is {value:5} — {reason:}}}";
    store.rebuild([noteFile('notes/n1.md', source)]);

    expect(store.ledgers()).toHaveLength(0);
    expect(store.invalid()).toHaveLength(0);
  });
});

describe('saving a file replaces all its directives and mirrors', () => {
  it('drops a removed directive and its mirror without merging with the old content', () => {
    const store = newStore();
    const originalSource = [
      tagsGainsDirective(A, C, 'married', 'wedding'),
      repSetDirective(A, C, -5, 'feud'),
    ].join('\n');
    store.rebuild([noteFile('notes/n1.md', originalSource)]);

    expect(ledgersOf(store, A, 'holder').find((l) => l.track === 'tg01')).toBeDefined();
    expect(ledgersOf(store, C, 'holder').find((l) => l.track === 'tg01')).toBeDefined(); // mirror
    expect(ledgersOf(store, A, 'holder').find((l) => l.track === 'rp01')).toBeDefined();

    const revisedSource = repSetDirective(A, C, -5, 'feud');
    store.updateFile(noteFile('notes/n1.md', revisedSource));

    expect(ledgersOf(store, A, 'holder').find((l) => l.track === 'tg01')).toBeUndefined();
    expect(ledgersOf(store, C, 'holder').find((l) => l.track === 'tg01')).toBeUndefined();
    expect(ledgersOf(store, A, 'holder').find((l) => l.track === 'rp01')).toBeDefined();
  });
});

describe('mutual options mirror', () => {
  it('mirrors a mutual add to the other side', () => {
    const store = newStore();
    store.rebuild([noteFile('notes/n1.md', tagsGainsDirective(A, C, 'married', 'wedding'))]);

    const direct = ledgersOf(store, A, 'both').find((l) => l.holder === A && l.observer === C);
    const mirror = ledgersOf(store, C, 'both').find((l) => l.holder === C && l.observer === A);
    expect(direct?.deltas).toEqual([expect.objectContaining({ op: 'add', key: 'married' })]);
    expect(mirror?.deltas).toEqual([
      expect.objectContaining({ op: 'add', key: 'married', mirrored: true }),
    ]);
  });

  it('mirrors a mutual remove to the other side', () => {
    const store = newStore();
    // Remove has no order-free meaning, so it's event-only — see AGENTS.md.
    const source = [
      tagsGainsDirective(A, C, 'married', 'wedding'),
      tagsLosesDirective(A, C, 'married', 'divorce'),
    ].join('\n');
    store.rebuild([eventFile('timeline/e1.md', source, 1000)]);

    const mirror = ledgersOf(store, C, 'both').find((l) => l.holder === C && l.observer === A);
    expect(mirror?.deltas.map((d) => d.op)).toEqual(['add', 'remove']);
    expect(mirror?.deltas.every((d) => d.mirrored)).toBe(true);
  });

  it('does not mirror a non-mutual option', () => {
    const store = newStore();
    store.rebuild([noteFile('notes/n1.md', tagsGainsDirective(A, C, 'member', 'joined'))]);

    const mirror = ledgersOf(store, C, 'both').find((l) => l.holder === C && l.observer === A);
    expect(mirror).toBeUndefined();
  });
});

const FLIP_TRACK_NON_MUTUAL: CategoricalTrackSpec = {
  kind: 'categorical',
  id: 'cst2',
  name: 'Flip Track',
  options: [{ key: 'friend', label: 'Friend', mutual: false }],
  actions: [
    {
      key: 'gains',
      label: 'Gains',
      kind: 'add',
      template: '{holder} is now {option} with {observer} — {reason}',
    },
  ],
};

const FLIP_TRACK_MUTUAL: CategoricalTrackSpec = {
  ...FLIP_TRACK_NON_MUTUAL,
  options: [{ key: 'friend', label: 'Friend', mutual: true }],
};

function flipTrackDirective(holder: string, observer: string): string {
  return `{{cst2.gains {holder:[[${holder}]]} is now {option:friend} with {observer:[[${observer}]]} — {reason:met}}}`;
}

describe("flipping an option's mutual flag re-derives history", () => {
  it('adds/removes the mirror ledger when the library changes, with no per-file re-save', () => {
    const store = newStore();
    store.setLibrary({ custom: [FLIP_TRACK_NON_MUTUAL], optionAdditions: {} });
    store.rebuild([noteFile('notes/n1.md', flipTrackDirective(A, C))]);

    expect(
      ledgersOf(store, C, 'both').find((l) => l.holder === C && l.observer === A),
    ).toBeUndefined();

    store.setLibrary({ custom: [FLIP_TRACK_MUTUAL], optionAdditions: {} });

    const mirror = ledgersOf(store, C, 'both').find((l) => l.holder === C && l.observer === A);
    expect(mirror?.deltas).toEqual([
      expect.objectContaining({ op: 'add', key: 'friend', mirrored: true }),
    ]);
  });
});

describe('reverse index recomputes only touched ledgers', () => {
  it('preserves object identity for ledgers untouched by an update', () => {
    const store = newStore();
    store.rebuild([
      noteFile('notes/n1.md', repSetDirective(A, C, -2, 'a')),
      noteFile('notes/n2.md', tagsGainsDirective('e5f6', 'g7h8', 'member', 'joined')),
    ]);

    const untouchedBefore = ledgersOf(store, 'e5f6', 'holder')[0];
    const touchedBefore = ledgersOf(store, A, 'holder')[0];

    const result = store.updateFile(noteFile('notes/n1.md', repSetDirective(A, C, -9, 'b')));

    const untouchedAfter = ledgersOf(store, 'e5f6', 'holder')[0];
    const touchedAfter = ledgersOf(store, A, 'holder')[0];

    expect(untouchedAfter).toBe(untouchedBefore);
    expect(touchedAfter).not.toBe(touchedBefore);
    expect(result.touched).toEqual([{ holder: A, observer: C, track: 'rp01' }]);
  });
});

describe('moving an event re-orders its deltas', () => {
  it('changes fold order via a plain file update — no relationship-specific move handling', () => {
    const store = newStore();
    store.rebuild([
      eventFile('timeline/early.md', repChangeDirective(A, C, 1, 'a'), 1000),
      eventFile('timeline/late.md', repChangeDirective(A, C, 2, 'b'), 2000),
    ]);

    const ledger = () => ledgersOf(store, A, 'holder').find((l) => l.observer === C)!;
    const sortedPathsBefore = [...ledger().deltas]
      .sort(compareDeltas)
      .map((d) => d.declaredIn.path);
    expect(sortedPathsBefore).toEqual(['timeline/early.md', 'timeline/late.md']);

    store.updateFile(eventFile('timeline/early.md', repChangeDirective(A, C, 1, 'a'), 3000));

    const sortedPathsAfter = [...ledger().deltas].sort(compareDeltas).map((d) => d.declaredIn.path);
    expect(sortedPathsAfter).toEqual(['timeline/late.md', 'timeline/early.md']);
  });
});

describe('deleting an event removes its deltas and mirrors', () => {
  it('clears both the direct and mirror ledgers', () => {
    const store = newStore();
    store.rebuild([
      eventFile('timeline/e1.md', tagsGainsDirective(A, C, 'married', 'wedding'), 1000),
    ]);

    expect(ledgersOf(store, A, 'holder')).toHaveLength(1); // direct: (A, C)
    expect(ledgersOf(store, C, 'holder')).toHaveLength(1); // mirror: (C, A)

    store.removeFile('timeline/e1.md');

    expect(ledgersOf(store, A, 'holder')).toHaveLength(0);
    expect(ledgersOf(store, C, 'holder')).toHaveLength(0);
  });
});

describe('invalid directives are retained and surfaced', () => {
  it('records an unknown-track problem mentioning the track id', () => {
    const store = newStore();
    const source =
      '{{rp99.change Rep change: {amount:-2} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:x}}}';
    store.rebuild([noteFile('notes/n1.md', source)]);

    expect(store.ledgers()).toHaveLength(0);
    const invalid = store.invalid();
    expect(invalid).toHaveLength(1);
    expect(invalid[0].messages.join(' ')).toMatch(/rp99/);
  });
});

describe('the store owns known notes as path -> id, seeded at load', () => {
  it('flags a referencing directive invalid once its note is deleted, then valid again on recreate', () => {
    const store = new RelationshipsStore();
    store.seedKnownNotes([
      { path: 'notes/holder.md', id: A },
      { path: 'notes/observer.md', id: C },
    ]);
    store.rebuild([noteFile('notes/n1.md', repSetDirective(A, C, 5, 'gift'))]);

    expect(store.invalid()).toHaveLength(0);
    expect(ledgersOf(store, A, 'holder')).toHaveLength(1);

    // The note was untouched since load — its id came only from seedKnownNotes.
    const removeResult = store.removeFile('notes/holder.md');
    expect(removeResult.knownNotesChanged).toBe(true);

    const invalidAfterDelete = store.invalid();
    expect(invalidAfterDelete).toHaveLength(1);
    expect(invalidAfterDelete[0].path).toBe('notes/n1.md');
    expect(ledgersOf(store, A, 'holder')).toHaveLength(0);

    // Recreating the note (same id) re-derives the referencing file back to valid.
    const recreateResult = store.updateFile(noteFile('notes/holder.md', ''));
    expect(recreateResult.knownNotesChanged).toBe(false); // no noteId set on this plain noteFile()
  });

  it('resolves referencing directives via the id, regardless of note path', () => {
    const store = new RelationshipsStore();
    store.seedKnownNotes([
      { path: 'notes/holder.md', id: A },
      { path: 'notes/observer.md', id: C },
    ]);
    store.rebuild([noteFile('notes/n1.md', repSetDirective(A, C, 5, 'gift'))]);
    expect(store.invalid()).toHaveLength(0);

    // Simulate a rename/move: unlink the old path, add the new one with the same id.
    store.removeFile('notes/holder.md');
    expect(store.invalid()).toHaveLength(1);

    const input: RelationshipFileInput = {
      path: 'notes/moved-holder.md',
      source: '',
      title: 'Holder',
      isEvent: false,
      noteId: A,
    };
    store.updateFile(input);

    expect(store.invalid()).toHaveLength(0);
    expect(ledgersOf(store, A, 'holder')).toHaveLength(1);
  });
});

describe('more than one undated Set on the same relationship', () => {
  it('flags every undated Set invalid and excludes them all from the ledger', () => {
    const store = newStore();
    store.rebuild([
      noteFile('notes/n1.md', repSetDirective(A, C, 5, 'first')),
      noteFile('notes/n2.md', repSetDirective(A, C, 9, 'second')),
    ]);

    const ledger = ledgersOf(store, A, 'holder').find((l) => l.track === 'rp01');
    expect(ledger?.deltas).toHaveLength(0);

    const invalid = store.invalid();
    expect(invalid).toHaveLength(2);
    expect(invalid.map((i) => i.path).sort()).toEqual(['notes/n1.md', 'notes/n2.md']);
    expect(invalid[0].messages.join(' ')).toMatch(/Only one note may set this relationship/);
    expect(invalid[0].messages.join(' ')).toMatch(/notes\/n2\.md|notes\/n1\.md/);
  });

  it('restores the remaining Set once the conflicting one is removed', () => {
    const store = newStore();
    store.rebuild([
      noteFile('notes/n1.md', repSetDirective(A, C, 5, 'first')),
      noteFile('notes/n2.md', repSetDirective(A, C, 9, 'second')),
    ]);
    expect(store.invalid()).toHaveLength(2);

    store.removeFile('notes/n2.md');

    expect(store.invalid()).toHaveLength(0);
    const ledger = ledgersOf(store, A, 'holder').find((l) => l.track === 'rp01');
    expect(ledger?.deltas).toHaveLength(1);
    expect(ledger?.deltas[0].declaredIn.path).toBe('notes/n1.md');
  });
});

describe('undatedSets', () => {
  it('lists every undated Set from the raw ledgers — including conflicting ones cleanLedger would drop', () => {
    const store = newStore();
    store.rebuild([
      noteFile('notes/n1.md', repSetDirective(A, C, 5, 'first')),
      noteFile('notes/n2.md', repSetDirective(A, C, 9, 'second')),
    ]);

    // cleanLedger (via ledgers()) drops both conflicting Sets...
    const ledger = ledgersOf(store, A, 'holder').find((l) => l.track === 'rp01');
    expect(ledger?.deltas).toHaveLength(0);

    // ...but undatedSets() still reports both, straight from the raw ledger.
    const undated = store.undatedSets();
    expect(undated).toHaveLength(2);
    expect(undated.map((u) => u.path).sort()).toEqual(['notes/n1.md', 'notes/n2.md']);
    for (const u of undated) {
      expect(u.holder).toBe(A);
      expect(u.observer).toBe(C);
      expect(u.trackId).toBe('rp01');
    }
  });

  it('excludes Change deltas and dated (event) Sets', () => {
    const store = newStore();
    store.rebuild([
      noteFile('notes/n1.md', repSetDirective(A, C, 5, 'first')),
      eventFile('events/e1.md', repSetDirective(A, C, 9, 'dated'), 1000),
      eventFile('events/e2.md', repChangeDirective(A, C, 2, 'change'), 2000),
    ]);

    const undated = store.undatedSets();
    expect(undated).toEqual([{ trackId: 'rp01', holder: A, observer: C, path: 'notes/n1.md' }]);
  });

  it('reflects a removed file', () => {
    const store = newStore();
    store.rebuild([noteFile('notes/n1.md', repSetDirective(A, C, 5, 'first'))]);
    expect(store.undatedSets()).toHaveLength(1);

    store.removeFile('notes/n1.md');
    expect(store.undatedSets()).toHaveLength(0);
  });
});

describe('titles', () => {
  it('titles() maps every indexed file to its title after rebuild', () => {
    const store = newStore();
    store.rebuild([
      {
        ...eventFile('timeline/e1.md', repChangeDirective(A, C, -2, 'x'), 1000),
        title: 'H1 Title',
      },
      { ...eventFile('timeline/e2.md', 'no directives', 2000), title: 'Frontmatter Fallback' },
      { ...noteFile('notes/n1.md', repSetDirective(A, C, 3, 'x')), title: 'Note One' },
      { ...noteFile('notes/n2.md', 'plain prose'), title: 'Bare Note' },
    ]);
    expect(store.titles()).toEqual({
      'timeline/e1.md': 'H1 Title',
      'timeline/e2.md': 'Frontmatter Fallback',
      'notes/n1.md': 'Note One',
      'notes/n2.md': 'Bare Note',
    });
  });

  it('a title-only edit updates titles() and reports titleChanged', () => {
    const store = newStore();
    const source = repSetDirective(A, C, 3, 'x');
    store.rebuild([{ ...noteFile('notes/n1.md', source), title: 'Old' }]);
    const result = store.updateFile({ ...noteFile('notes/n1.md', source), title: 'New' });
    expect(result.titleChanged).toBe(true);
    expect(store.titles()['notes/n1.md']).toBe('New');
  });

  it('saving without a title change reports titleChanged false', () => {
    const store = newStore();
    const source = repSetDirective(A, C, 3, 'x');
    store.rebuild([noteFile('notes/n1.md', source)]);
    expect(store.updateFile(noteFile('notes/n1.md', source)).titleChanged).toBe(false);
  });

  it('deleting a file removes its title', () => {
    const store = newStore();
    store.rebuild([noteFile('notes/n1.md', 'prose')]);
    const result = store.removeFile('notes/n1.md');
    expect(result.titleChanged).toBe(true);
    expect(store.titles()).not.toHaveProperty('notes/n1.md');
  });

  it('renaming (remove old path + add new path) moves the title', () => {
    const store = newStore();
    store.rebuild([{ ...eventFile('timeline/old.md', 'prose', 1000), title: 'Battle' }]);
    store.removeFile('timeline/old.md');
    const added = store.updateFile({
      ...eventFile('timeline/new.md', 'prose', 1000),
      title: 'Battle',
    });
    expect(added.titleChanged).toBe(true);
    expect(store.titles()).toEqual({ 'timeline/new.md': 'Battle' });
  });

  it('titles are cleared on close and rebuilt on reopen', () => {
    const store = newStore();
    store.rebuild([noteFile('notes/n1.md', 'prose')]);
    store.clear();
    expect(store.titles()).toEqual({});
    store.rebuild([noteFile('notes/n2.md', 'prose')]);
    expect(Object.keys(store.titles())).toEqual(['notes/n2.md']);
  });
});

describe('invalid entries: unfinished drafts and trackId', () => {
  const DRAFT =
    '{{rp01.change Rep change: {amount:} {observer:[[a1b2]]} rep for {holder:} — {reason:}}}';

  it('an unfinished draft in an undated event is not reported', () => {
    const store = newStore();
    store.rebuild([eventFile('timeline/e1.md', 'prose', null)]);
    const before = store.invalid();
    store.rebuild([eventFile('timeline/e1.md', `prose\n${DRAFT}`, null)]);
    expect(store.invalid()).toEqual(before);
  });

  it("a finished directive in an undated event is still 'Event has no date'", () => {
    const store = newStore();
    store.rebuild([eventFile('timeline/e1.md', repChangeDirective(A, C, -2, 'x'), null)]);
    expect(store.invalid()).toHaveLength(1);
    expect(store.invalid()[0].messages).toEqual(['Event has no date']);
  });

  it('an unfinished draft in a dated event does not change the invalid count', () => {
    const store = newStore();
    store.rebuild([eventFile('timeline/e1.md', 'prose', 1000)]);
    const before = store.invalid().length;
    store.rebuild([eventFile('timeline/e1.md', `prose\n${DRAFT}`, 1000)]);
    expect(store.invalid()).toHaveLength(before);
  });

  it('invalid entries carry trackId when the envelope parsed', () => {
    const store = newStore();
    const unknownAction = '{{rp01.bogus Something {holder:[[c3d4]]}}}';
    const unknownNote = repChangeDirective(A, 'zzzz', -1, 'x');
    store.rebuild([
      eventFile('timeline/e1.md', `${unknownAction}\n${unknownNote}`, 1000),
      noteFile('notes/n1.md', repSetDirective(A, C, 3, 'one')),
      noteFile('notes/n2.md', repSetDirective(A, C, 4, 'two')),
      eventFile('timeline/undated.md', repChangeDirective(A, C, -2, 'x'), null),
    ]);
    const entries = store.invalid();
    const forPath = (p: string) => entries.filter((e) => e.path === p);
    expect(forPath('timeline/e1.md').length).toBeGreaterThanOrEqual(2);
    for (const e of forPath('timeline/e1.md')) expect(e.trackId).toBe('rp01');
    expect(forPath('timeline/undated.md')[0].trackId).toBe('rp01');
    expect(forPath('notes/n1.md')[0].trackId).toBe('rp01');
    expect(forPath('notes/n2.md')[0].trackId).toBe('rp01');
  });

  it('parse errors without an envelope have no trackId', () => {
    const store = newStore();
    store.rebuild([eventFile('timeline/e1.md', '{{rp01.change never closed', 1000)]);
    const entries = store.invalid();
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(e.trackId).toBeUndefined();
      expect(e.ordinal).toBeUndefined();
    }
  });
});
