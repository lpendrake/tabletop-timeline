import { describe, it, expect } from 'vitest';
import { compareDeltas } from '../../shared/relationships/index.js';
import type { CategoricalTrackSpec, TrackLibrary } from '../../shared/relationships/index.js';
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
  store.setKnownNoteIds([A, C, 'e5f6', 'g7h8']);
  return store;
}

describe('event directives get at from epochSeconds; note directives are undated', () => {
  it('assigns `at` from the event epochSeconds and null for a note directive', () => {
    const store = newStore();
    store.rebuild([
      eventFile('timeline/e1.md', repChangeDirective(A, C, -2, 'attacked'), 1000),
      noteFile('notes/n1.md', repChangeDirective(C, A, 3, 'gift')),
    ]);

    const eventLedger = store.ledgersFor(A, 'holder')[0];
    expect(eventLedger.deltas).toHaveLength(1);
    expect(eventLedger.deltas[0].at).toBe(1000);

    const noteLedger = store.ledgersFor(C, 'holder')[0];
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
      '{{rp01.change Rep change: {amount:-2} {observer:[[a1b2]]} rep for {holder:} — {reason:}}}';
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
      repChangeDirective(A, C, -5, 'feud'),
    ].join('\n');
    store.rebuild([noteFile('notes/n1.md', originalSource)]);

    expect(store.ledgersFor(A, 'holder').find((l) => l.track === 'tg01')).toBeDefined();
    expect(store.ledgersFor(C, 'holder').find((l) => l.track === 'tg01')).toBeDefined(); // mirror
    expect(store.ledgersFor(A, 'holder').find((l) => l.track === 'rp01')).toBeDefined();

    const revisedSource = repChangeDirective(A, C, -5, 'feud');
    store.updateFile(noteFile('notes/n1.md', revisedSource));

    expect(store.ledgersFor(A, 'holder').find((l) => l.track === 'tg01')).toBeUndefined();
    expect(store.ledgersFor(C, 'holder').find((l) => l.track === 'tg01')).toBeUndefined();
    expect(store.ledgersFor(A, 'holder').find((l) => l.track === 'rp01')).toBeDefined();
  });
});

describe('mutual options mirror', () => {
  it('mirrors a mutual add to the other side', () => {
    const store = newStore();
    store.rebuild([noteFile('notes/n1.md', tagsGainsDirective(A, C, 'married', 'wedding'))]);

    const direct = store.ledgersFor(A, 'both').find((l) => l.holder === A && l.observer === C);
    const mirror = store.ledgersFor(C, 'both').find((l) => l.holder === C && l.observer === A);
    expect(direct?.deltas).toEqual([expect.objectContaining({ op: 'add', key: 'married' })]);
    expect(mirror?.deltas).toEqual([
      expect.objectContaining({ op: 'add', key: 'married', mirrored: true }),
    ]);
  });

  it('mirrors a mutual remove to the other side', () => {
    const store = newStore();
    const source = [
      tagsGainsDirective(A, C, 'married', 'wedding'),
      tagsLosesDirective(A, C, 'married', 'divorce'),
    ].join('\n');
    store.rebuild([noteFile('notes/n1.md', source)]);

    const mirror = store.ledgersFor(C, 'both').find((l) => l.holder === C && l.observer === A);
    expect(mirror?.deltas.map((d) => d.op)).toEqual(['add', 'remove']);
    expect(mirror?.deltas.every((d) => d.mirrored)).toBe(true);
  });

  it('does not mirror a non-mutual option', () => {
    const store = newStore();
    store.rebuild([noteFile('notes/n1.md', tagsGainsDirective(A, C, 'member', 'joined'))]);

    const mirror = store.ledgersFor(C, 'both').find((l) => l.holder === C && l.observer === A);
    expect(mirror).toBeUndefined();
  });
});

const SET_TRACK: CategoricalTrackSpec = {
  kind: 'categorical',
  id: 'cst1',
  name: 'Custom Set Track',
  multiple: true,
  extensible: true,
  options: [
    { key: 'ally', label: 'Ally', mutual: false },
    { key: 'rival', label: 'Rival', mutual: false },
    { key: 'allied', label: 'Allied', mutual: true },
    { key: 'sworn-enemy', label: 'Sworn Enemy', mutual: true },
  ],
  actions: [
    {
      key: 'set',
      label: 'Set',
      kind: 'set',
      template: '{holder} and {observer} become {option} — {reason}',
    },
  ],
};

function setTrackDirective(
  holder: string,
  observer: string,
  option: string,
  reason: string,
): string {
  return `{{cst1.set {holder:[[${holder}]]} and {observer:[[${observer}]]} become {option:${option}} — {reason:${reason}}}}`;
}

describe('set with mixed mutual and non-mutual options mirrors only mutual ones', () => {
  it('mirrors add/remove for each mutual option, leaves non-mutual options alone', () => {
    const store = newStore();
    const library: TrackLibrary = { custom: [SET_TRACK], optionAdditions: {} };
    store.setLibrary(library);
    store.rebuild([noteFile('notes/n1.md', setTrackDirective(A, C, 'allied', 'reconciled'))]);

    const direct = store.ledgersFor(A, 'both').find((l) => l.holder === A && l.observer === C);
    expect(direct?.deltas).toEqual([expect.objectContaining({ op: 'set', value: ['allied'] })]);

    const mirror = store.ledgersFor(C, 'both').find((l) => l.holder === C && l.observer === A);
    // Only the two mutual options (allied, sworn-enemy) are mirrored — ally/rival are untouched.
    expect(mirror?.deltas).toHaveLength(2);
    expect(mirror?.deltas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: 'add', key: 'allied', mirrored: true }),
        expect.objectContaining({ op: 'remove', key: 'sworn-enemy', mirrored: true }),
      ]),
    );
  });
});

const FLIP_TRACK_NON_MUTUAL: CategoricalTrackSpec = {
  kind: 'categorical',
  id: 'cst2',
  name: 'Flip Track',
  multiple: true,
  extensible: true,
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
      store.ledgersFor(C, 'both').find((l) => l.holder === C && l.observer === A),
    ).toBeUndefined();

    store.setLibrary({ custom: [FLIP_TRACK_MUTUAL], optionAdditions: {} });

    const mirror = store.ledgersFor(C, 'both').find((l) => l.holder === C && l.observer === A);
    expect(mirror?.deltas).toEqual([
      expect.objectContaining({ op: 'add', key: 'friend', mirrored: true }),
    ]);
  });
});

describe('reverse index recomputes only touched ledgers', () => {
  it('preserves object identity for ledgers untouched by an update', () => {
    const store = newStore();
    store.rebuild([
      noteFile('notes/n1.md', repChangeDirective(A, C, -2, 'a')),
      noteFile('notes/n2.md', tagsGainsDirective('e5f6', 'g7h8', 'member', 'joined')),
    ]);

    const untouchedBefore = store.ledgersFor('e5f6', 'holder')[0];
    const touchedBefore = store.ledgersFor(A, 'holder')[0];

    const result = store.updateFile(noteFile('notes/n1.md', repChangeDirective(A, C, -9, 'b')));

    const untouchedAfter = store.ledgersFor('e5f6', 'holder')[0];
    const touchedAfter = store.ledgersFor(A, 'holder')[0];

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

    const ledger = () => store.ledgersFor(A, 'holder').find((l) => l.observer === C)!;
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

    expect(store.ledgersFor(A, 'holder')).toHaveLength(1); // direct: (A, C)
    expect(store.ledgersFor(C, 'holder')).toHaveLength(1); // mirror: (C, A)

    store.removeFile('timeline/e1.md');

    expect(store.ledgersFor(A, 'holder')).toHaveLength(0);
    expect(store.ledgersFor(C, 'holder')).toHaveLength(0);
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
