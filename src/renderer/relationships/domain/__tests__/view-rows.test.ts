import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_TRACK_LIBRARY,
  resolveTrack,
  type Ledger,
  type RelationshipDelta,
  type ResolvedTrack,
} from '../../../../shared/relationships';
import { CalendarProvider } from '../../../timeline/calendar/provider';
import { canDragRows, deriveViewRows, type ViewRowsInput } from '../view-rows';
import { noBands, unboundedBands } from './numeric-fixtures';
import { defaultViewOrder, groupListKey, rowListKey, type ViewOrder } from '../view-order';

const track = resolveTrack('rp01', EMPTY_TRACK_LIBRARY) as ResolvedTrack;
const LABELS: Record<string, string> = {
  aaaa: 'Zara',
  bbbb: 'Anna',
  cccc: 'Mira',
  dddd: 'Dax',
  eeee: 'Eve',
};
const labelFor = (id: string) => LABELS[id] ?? id;
const NOW = 1000;

function delta(partial: Partial<RelationshipDelta> & Pick<RelationshipDelta, 'op'>) {
  return {
    at: null,
    declaredIn: { path: 'notes/x.md', ordinal: 0 },
    ...partial,
  } as RelationshipDelta;
}

const LEDGERS: Ledger[] = [
  {
    holder: 'aaaa',
    observer: 'cccc',
    track: 'rp01',
    deltas: [
      delta({
        op: 'adjust',
        by: 10,
        at: 50,
        declaredIn: { path: 'timeline/battle.md', ordinal: 0 },
        reason: 'Defended the docks',
      }),
      delta({
        op: 'adjust',
        by: 2,
        at: 100,
        declaredIn: { path: 'timeline/feast.md', ordinal: 0 },
      }),
      delta({ op: 'adjust', by: 1, at: null, declaredIn: { path: 'notes/mira.md', ordinal: 0 } }),
    ],
  },
  {
    holder: 'aaaa',
    observer: 'dddd',
    track: 'rp01',
    deltas: [
      delta({ op: 'adjust', by: -5, at: 70, declaredIn: { path: 'notes/dax.md', ordinal: 0 } }),
    ],
  },
  {
    holder: 'aaaa',
    observer: 'eeee',
    track: 'rp01',
    deltas: [
      delta({ op: 'adjust', by: 1, at: 5000, declaredIn: { path: 'notes/eve.md', ordinal: 0 } }),
    ],
  },
  {
    holder: 'bbbb',
    observer: 'cccc',
    track: 'rp01',
    deltas: [
      delta({
        op: 'adjust',
        by: 3,
        at: 60,
        declaredIn: { path: 'timeline/battle.md', ordinal: 1 },
      }),
    ],
  },
];

const TITLES = new Map([
  ['timeline/battle.md', 'Battle of the docks'],
  ['timeline/feast.md', 'Winter feast'],
]);

function input(over: Partial<ViewRowsInput> = {}): ViewRowsInput {
  return {
    ledgers: LEDGERS,
    track,
    trackId: 'rp01',
    holderId: 'aaaa',
    now: NOW,
    titleByPath: TITLES,
    labelFor,
    query: '',
    enabledScopes: ['name', 'band', 'event', 'reason'],
    sortMode: 'mine',
    viewOrder: defaultViewOrder(),
    ...over,
  };
}

const order = (o: Partial<ViewOrder>): ViewOrder => ({ ...defaultViewOrder(), ...o });
const observers = (r: ReturnType<typeof deriveViewRows>, g = 0) =>
  r.groups[g].rows.map((x) => x.observerId);

beforeEach(() => {
  CalendarProvider._reset();
});

describe('view-rows', () => {
  it('a relationship reads the same on its tab under a single holder and under All holders', () => {
    const single = deriveViewRows(input({ holderId: 'aaaa' })).groups[0].rows.find(
      (r) => r.observerId === 'cccc',
    )!;
    const all = deriveViewRows(input({ holderId: '*' }))
      .groups.find((g) => g.holderId === 'aaaa')!
      .rows.find((r) => r.observerId === 'cccc')!;
    expect(all.value).toEqual(single.value);
    expect(all.formatted).toBe(single.formatted);
    expect(all.stateLabel).toBe(single.stateLabel);
    expect(all.lastChange).toEqual(single.lastChange);
    expect(all.entryCount).toBe(single.entryCount);
    expect(single.value).toBe(13);
    expect(single.entryCount).toBe(3);
    expect(single.lastChange?.at).toBe(100);
    expect(single.onlyFuture).toBe(false);
  });

  it('flags a relationship whose every change is in the future', () => {
    const eve = deriveViewRows(input()).groups[0].rows.find((r) => r.observerId === 'eeee')!;
    expect(eve.onlyFuture).toBe(true);
    expect(eve.lastChange).toBeNull();
  });

  it("rows are ordered by the holder's list and unlisted rows append alphabetically", () => {
    const viewOrder = order({ order: { [rowListKey('rp01', 'aaaa')]: ['eeee', 'stale-id'] } });
    const result = deriveViewRows(input({ viewOrder }));
    // Eve first (listed), then Dax, Mira (alphabetical by label).
    expect(observers(result)).toEqual(['eeee', 'dddd', 'cccc']);
  });

  it('a relationship missing from view-order.json still renders', () => {
    const viewOrder = order({ order: { [rowListKey('rp01', 'aaaa')]: ['cccc'] } });
    expect(observers(deriveViewRows(input({ viewOrder })))).toEqual(['cccc', 'dddd', 'eeee']);
  });

  it('All holders groups follow rp01:* order and collapse by holder id', () => {
    const viewOrder = order({
      order: { [groupListKey('rp01')]: ['bbbb'] },
      collapsed: { [groupListKey('rp01')]: ['aaaa'] },
    });
    const result = deriveViewRows(input({ holderId: '*', viewOrder }));
    expect(result.groups.map((g) => g.holderId)).toEqual(['bbbb', 'aaaa']);
    expect(result.groups.map((g) => g.collapsed)).toEqual([false, true]);
    expect(result.groups[0].listKey).toBe('rp01:bbbb');

    const alpha = deriveViewRows(input({ holderId: '*' }));
    expect(alpha.groups.map((g) => g.holderId)).toEqual(['bbbb', 'aaaa']); // Anna, Zara
  });

  it('search hides non-matching rows and empty groups', () => {
    const result = deriveViewRows(input({ holderId: '*', query: 'dax' }));
    expect(result.groups.map((g) => g.holderId)).toEqual(['aaaa']);
    expect(observers(result)).toEqual(['dddd']);
    expect(result.matched).toBe(1);
    expect(result.total).toBe(4);
  });

  it('a history match auto-opens the row and marks hit entries', () => {
    const result = deriveViewRows(input({ query: 'battle' }));
    expect(observers(result)).toEqual(['cccc']);
    const row = result.groups[0].rows[0];
    expect(row.expanded).toBe(true);
    const hits = Object.fromEntries(row.history!.map((h) => [h.eventTitle, h.hit]));
    expect(hits['Battle of the docks']).toBe(true);
    expect(hits['Winter feast']).toBe(false);
  });

  it('collapsed rows compute no history', () => {
    const viewOrder = order({ expanded: { [rowListKey('rp01', 'aaaa')]: ['dddd'] } });
    const rows = deriveViewRows(input({ viewOrder })).groups[0].rows;
    const byId = Object.fromEntries(rows.map((r) => [r.observerId, r]));
    expect(byId.cccc.history).toBeNull();
    expect(byId.cccc.expanded).toBe(false);
    expect(byId.dddd.expanded).toBe(true);
    expect(byId.dddd.history).toHaveLength(1);
    expect(byId.dddd.history![0].hit).toBeNull();
  });

  it("history lists undated note entries first as 'Undated note'", () => {
    const viewOrder = order({ expanded: { [rowListKey('rp01', 'aaaa')]: ['cccc'] } });
    const row = deriveViewRows(input({ viewOrder })).groups[0].rows.find(
      (r) => r.observerId === 'cccc',
    )!;
    const history = row.history!;
    expect(history.map((h) => h.at)).toEqual([null, 50, 100]);
    expect(history[0].dateLabel).toBe('Undated note');
    expect(history[1].dateLabel).not.toBe('Undated note');
    expect(history[2].runningValue).toBe(13);
    expect(history[2].runningFormatted).toBe(row.formatted);
    expect(history[1].reason).toBe('Defended the docks');
  });

  it('drag is only allowed in My order with no query', () => {
    expect(canDragRows('mine', '')).toBe(true);
    expect(canDragRows('mine', '  ')).toBe(true);
    expect(canDragRows('mine', 'x')).toBe(false);
    expect(canDragRows('value', '')).toBe(false);
    expect(deriveViewRows(input({ sortMode: 'recent' })).canDrag).toBe(false);
    expect(deriveViewRows(input()).canDrag).toBe(true);
  });

  it('is grouped under All holders, even when search leaves one group, and not under one holder', () => {
    expect(deriveViewRows(input({ holderId: '*' })).grouped).toBe(true);
    const narrowed = deriveViewRows(input({ holderId: '*', query: 'dax' }));
    expect(narrowed.groups).toHaveLength(1);
    expect(narrowed.grouped).toBe(true);
    expect(deriveViewRows(input({ holderId: 'aaaa' })).grouped).toBe(false);
  });

  it('sorts by value and by recent change', () => {
    expect(observers(deriveViewRows(input({ sortMode: 'value' })))).toEqual([
      'cccc',
      'eeee',
      'dddd',
    ]);
    expect(observers(deriveViewRows(input({ sortMode: 'recent' })))[0]).toBe('cccc');
  });

  it('column sorts reorder rows within each group and disable drag', () => {
    const names = (sortMode: ViewRowsInput['sortMode']) =>
      deriveViewRows(input({ holderId: '*', sortMode })).groups.map((g) => [
        g.holderId,
        g.rows.map((r) => r.observerId),
      ]);
    expect(names({ column: 'name', dir: 'asc' })).toEqual([
      ['bbbb', ['cccc']],
      ['aaaa', ['dddd', 'eeee', 'cccc']],
    ]);
    expect(names({ column: 'name', dir: 'desc' })[1]).toEqual(['aaaa', ['cccc', 'eeee', 'dddd']]);
    expect(names({ column: 'entries', dir: 'desc' })[1]).toEqual([
      'aaaa',
      ['cccc', 'dddd', 'eeee'],
    ]);
    expect(names({ column: 'value', dir: 'asc' })[1]).toEqual(['aaaa', ['dddd', 'eeee', 'cccc']]);
    expect(names({ column: 'band', dir: 'desc' })[1]).toEqual(['aaaa', ['cccc', 'eeee', 'dddd']]);

    const sorted = deriveViewRows(input({ sortMode: { column: 'name', dir: 'asc' } }));
    expect(sorted.canDrag).toBe(false);
    expect(deriveViewRows(input({ sortMode: 'mine' })).canDrag).toBe(true);
    expect(canDragRows({ column: 'name', dir: 'asc' }, '')).toBe(false);
  });

  describe('band sort', () => {
    const adjust = (observer: string, by: number): Ledger => ({
      holder: 'aaaa',
      observer,
      track: 'fx',
      deltas: [delta({ op: 'adjust', by })],
    });
    const bandOrder = (bandTrack: ResolvedTrack, ledgers: Ledger[], dir: 'asc' | 'desc') =>
      observers(
        deriveViewRows(
          input({ track: bandTrack, trackId: 'fx', ledgers, sortMode: { column: 'band', dir } }),
        ),
      );

    it('a value below the first band sorts with the first band, then by value, then name', () => {
      // Bands start at -10, 0 and 10: -15 is below the first band but still band 0.
      const ledgers = [
        adjust('cccc', -15), // Mira, band 0 (below the first band)
        adjust('dddd', -10), // Dax, band 0
        adjust('eeee', -10), // Eve, band 0, ties Dax on value
        adjust('ffff', 3), // band 1
        adjust('bbbb', 12), // Anna, band 2
      ];
      expect(bandOrder(unboundedBands, ledgers, 'desc')).toEqual([
        'bbbb',
        'ffff',
        'dddd',
        'eeee',
        'cccc',
      ]);
      expect(bandOrder(unboundedBands, ledgers, 'asc')).toEqual([
        'cccc',
        'dddd',
        'eeee',
        'ffff',
        'bbbb',
      ]);
    });

    it('a track without bands falls through to value, then name', () => {
      const ledgers = [adjust('cccc', 5), adjust('dddd', 5), adjust('eeee', 2)];
      expect(bandOrder(noBands, ledgers, 'desc')).toEqual(['dddd', 'cccc', 'eeee']);
      expect(bandOrder(noBands, ledgers, 'asc')).toEqual(['eeee', 'dddd', 'cccc']);
    });
  });
});
