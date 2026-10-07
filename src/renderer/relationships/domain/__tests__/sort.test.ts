import { describe, it, expect } from 'vitest';
import type { Ledger, RelationshipDelta } from '../../../../shared/relationships/model';
import {
  columnSortOf,
  compareHistoryEntries,
  entryCount,
  lastChange,
  nextColumnSort,
  sortLabel,
  sortModesForKind,
  sortRows,
  type ColumnSort,
  type RowSort,
  type SortableRow,
  type SortColumn,
} from '../sort';

const row = (
  key: string,
  lastAt: number | null | undefined,
  value: number | null = 0,
  extra: Partial<SortableRow> = {},
): SortableRow => ({
  key,
  label: key,
  value,
  lastAt,
  entries: 0,
  band: 0,
  ...extra,
});
const keys = (rows: readonly SortableRow[]) => rows.map((r) => r.key);
const delta = (at: number | null, path = 'a.md', ordinal = 0): RelationshipDelta => ({
  op: 'adjust',
  by: 1,
  at,
  declaredIn: { path, ordinal },
});

describe('sort', () => {
  it('recently changed puts undated after dated in descending order; history ascending puts undated first', () => {
    const rows = [row('u', null), row('old', 10), row('new', 20), row('none', undefined)];
    expect(sortRows(rows, 'recent').map((r) => r.key)).toEqual(['new', 'old', 'none', 'u']);
    const hist = [delta(5, 'b.md'), delta(null, 'z.md'), delta(5, 'a.md', 1), delta(5, 'a.md', 0)];
    const sorted = [...hist].sort(compareHistoryEntries);
    expect(sorted.map((d) => `${d.at}:${d.declaredIn.path}:${d.declaredIn.ordinal}`)).toEqual([
      'null:z.md:0',
      '5:a.md:0',
      '5:a.md:1',
      '5:b.md:0',
    ]);
    expect(
      sortRows([row('a', 0, 1), row('b', 0, 9), row('c', 0, null)], 'value').map((r) => r.key),
    ).toEqual(['b', 'a', 'c']);
    expect(sortRows([row('b', 0), row('a', 0)], 'alpha').map((r) => r.key)).toEqual(['a', 'b']);
    expect(sortLabel('alpha')).toBe('A–Z');
  });

  it('numeric tracks offer no sort buttons; ordinal and categorical keep theirs', () => {
    expect(sortModesForKind('numeric')).toEqual([]);
    expect(sortModesForKind('ordinal')).toEqual(['recent', 'alpha']);
    expect(sortModesForKind('categorical')).toEqual(['mine', 'value', 'recent']);
  });

  it('nextColumnSort cycles natural → flipped → My order', () => {
    const cycle = (column: SortColumn): RowSort[] => {
      const first = nextColumnSort('mine', column);
      const second = nextColumnSort(first, column);
      return [first, second, nextColumnSort(second, column)];
    };
    expect(cycle('value')).toEqual([
      { column: 'value', dir: 'desc' },
      { column: 'value', dir: 'asc' },
      'mine',
    ]);
    expect(cycle('name')).toEqual([
      { column: 'name', dir: 'asc' },
      { column: 'name', dir: 'desc' },
      'mine',
    ]);
  });

  it('clicking another column starts at its natural direction', () => {
    expect(nextColumnSort({ column: 'value', dir: 'asc' }, 'entries')).toEqual({
      column: 'entries',
      dir: 'desc',
    });
    expect(nextColumnSort({ column: 'entries', dir: 'desc' }, 'name')).toEqual({
      column: 'name',
      dir: 'asc',
    });
  });

  it("columnSortOf reports the active column's direction only", () => {
    const sort: ColumnSort = { column: 'band', dir: 'asc' };
    expect(columnSortOf(sort, 'band')).toBe('asc');
    expect(columnSortOf(sort, 'value')).toBeNull();
    expect(columnSortOf('mine', 'band')).toBeNull();
    expect(columnSortOf('recent', 'last')).toBeNull();
  });

  describe('column sorts', () => {
    // Two rows tie on every column, so only the A–Z fallback orders them.
    const rows = [
      row('b', 30, 5, { entries: 2, band: 1 }),
      row('a', 30, 5, { entries: 2, band: 1 }),
      row('c', 10, 9, { entries: 7, band: 2 }),
      row('d', 20, 1, { entries: 1, band: 0 }),
    ];
    const cases: Array<[SortColumn, string[], string[]]> = [
      ['entries', ['c', 'a', 'b', 'd'], ['d', 'a', 'b', 'c']],
      ['last', ['a', 'b', 'd', 'c'], ['c', 'd', 'a', 'b']],
      ['name', ['d', 'c', 'b', 'a'], ['a', 'b', 'c', 'd']],
      ['band', ['c', 'a', 'b', 'd'], ['d', 'a', 'b', 'c']],
      ['value', ['c', 'a', 'b', 'd'], ['d', 'a', 'b', 'c']],
    ];
    it.each(cases)('each column sorts both ways with stable A–Z ties: %s', (column, desc, asc) => {
      expect(keys(sortRows(rows, { column, dir: 'desc' }))).toEqual(desc);
      expect(keys(sortRows(rows, { column, dir: 'asc' }))).toEqual(asc);
    });

    it('rows without a last change stay last in both directions', () => {
      const dated = [row('u', null), row('old', 10), row('new', 20), row('none', undefined)];
      expect(keys(sortRows(dated, { column: 'last', dir: 'desc' }))).toEqual([
        'new',
        'old',
        'none',
        'u',
      ]);
      expect(keys(sortRows(dated, { column: 'last', dir: 'asc' }))).toEqual([
        'old',
        'new',
        'none',
        'u',
      ]);
    });

    it('rows without a value stay last in both directions', () => {
      const valued = [row('x', 0, null), row('lo', 0, 1), row('hi', 0, 9)];
      expect(keys(sortRows(valued, { column: 'value', dir: 'desc' }))).toEqual(['hi', 'lo', 'x']);
      expect(keys(sortRows(valued, { column: 'value', dir: 'asc' }))).toEqual(['lo', 'hi', 'x']);
    });

    it('rows without a band stay last in both directions', () => {
      const mixed = [row('x', 0, 9, { band: null }), row('lo', 0, 1, { band: 0 })];
      expect(keys(sortRows(mixed, { column: 'band', dir: 'desc' }))).toEqual(['lo', 'x']);
      expect(keys(sortRows(mixed, { column: 'band', dir: 'asc' }))).toEqual(['lo', 'x']);
    });

    it('band sorts by band, then value, then name', () => {
      const banded = [
        row('low', 0, 1, { band: 0 }),
        row('mid-b', 0, 7, { band: 1 }),
        row('mid-a', 0, 7, { band: 1 }),
        row('mid-hi', 0, 9, { band: 1 }),
        row('top', 0, 20, { band: 2 }),
      ];
      expect(keys(sortRows(banded, { column: 'band', dir: 'desc' }))).toEqual([
        'top',
        'mid-hi',
        'mid-a',
        'mid-b',
        'low',
      ]);
      expect(keys(sortRows(banded, { column: 'band', dir: 'asc' }))).toEqual([
        'low',
        'mid-a',
        'mid-b',
        'mid-hi',
        'top',
      ]);
    });
  });

  it('my order is sparse and advisory', () => {
    const rows = [row('d', 0), row('a', 0), row('c', 0), row('b', 0)];
    expect(sortRows(rows, 'mine', ['c', 'stale', 'd']).map((r) => r.key)).toEqual([
      'c',
      'd',
      'a',
      'b',
    ]);
    expect(sortRows(rows, 'mine').map((r) => r.key)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('lastChange ignores future deltas', () => {
    const ledger: Ledger = {
      holder: 'h',
      observer: 'o',
      track: 'rp01',
      deltas: [delta(null, 'n.md'), delta(10), delta(50, 'b.md'), delta(500, 'c.md')],
    };
    expect(lastChange(ledger, 100)?.at).toBe(50);
    expect(lastChange(ledger, 5)?.at).toBeNull();
    expect(lastChange({ ...ledger, deltas: [delta(500)] }, 100)).toBeNull();
    expect(entryCount(ledger)).toBe(4);
  });
});
