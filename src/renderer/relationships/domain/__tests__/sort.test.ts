import { describe, it, expect } from 'vitest';
import type { Ledger, RelationshipDelta } from '../../../../shared/relationships/model';
import {
  compareHistoryEntries,
  entryCount,
  lastChange,
  sortLabel,
  sortModesForKind,
  sortRows,
  type SortableRow,
} from '../sort';

const row = (
  key: string,
  lastAt: number | null | undefined,
  value: number | null = 0,
): SortableRow => ({
  key,
  label: key,
  value,
  lastAt,
});
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
    expect(sortModesForKind('ordinal')).toEqual(['recent', 'alpha']);
    expect(sortModesForKind('numeric')).toEqual(['mine', 'value', 'recent']);
    expect(sortLabel('alpha')).toBe('A–Z');
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
