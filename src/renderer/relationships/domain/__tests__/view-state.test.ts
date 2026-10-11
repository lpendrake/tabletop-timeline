import { describe, expect, it } from 'vitest';
import type { Ledger } from '../../../../shared/relationships/model';
import { sortModesForKind } from '../sort';
import {
  buildHolderPicker,
  moveInViewOrder,
  resolveSortMode,
  visibleIdsForList,
} from '../view-state';
import { defaultViewOrder, groupListKey, rowListKey } from '../view-order';
import type { ViewGroup, ViewRow } from '../view-rows';

const ledger = (track: string, holder: string, observer: string): Ledger => ({
  holder,
  observer,
  track,
  deltas: [],
});

describe('buildHolderPicker', () => {
  const ledgers = [ledger('t1', 'a', 'x'), ledger('t1', 'b', 'y'), ledger('t1', 'b', 'z')];
  const build = (kind: 'numeric' | 'ordinal' | 'categorical', savedHolderId: string | null) =>
    buildHolderPicker({
      kind,
      trackId: 't1',
      ledgers,
      defaultHolderId: 'a',
      savedHolderId,
      labelFor: (id) => id,
    });

  it('holder picker is hidden for categorical tracks', () => {
    const picker = build('categorical', 'b');
    expect(picker.show).toBe(false);
    expect(picker.selectedId).toBe('*');
    expect(picker.selectedCount).toBe(3);
  });

  it('holder picker is unchanged for numeric and ordinal', () => {
    for (const kind of ['numeric', 'ordinal'] as const) {
      const picker = build(kind, 'b');
      expect(picker.show).toBe(true);
      expect(picker.selectedId).toBe('b');
      expect(picker.selectedCount).toBe(2);
    }
  });
});

describe('row and group moves', () => {
  // Only holderId, listKey and observerId are read by the move helpers.
  const row = (observerId: string) => ({ observerId }) as ViewRow;
  const group = (holderId: string, observers: string[]): ViewGroup => ({
    holderId,
    label: holderId,
    listKey: rowListKey('t1', holderId),
    collapsed: false,
    rows: observers.map(row),
  });
  const groups: ViewGroup[] = [group('a', ['x', 'y', 'z']), group('b', ['p', 'q'])];

  it("visible ids are a group's observers or the holders of the group list", () => {
    expect(visibleIdsForList(groups, 't1', rowListKey('t1', 'a'))).toEqual(['x', 'y', 'z']);
    expect(visibleIdsForList(groups, 't1', groupListKey('t1'))).toEqual(['a', 'b']);
    expect(visibleIdsForList(groups, 't1', 't1:unknown')).toEqual([]);
  });

  it('moving a row or a group rewrites only that list', () => {
    const viewOrder = { ...defaultViewOrder(), order: { [rowListKey('t1', 'b')]: ['q', 'p'] } };
    const rowMoved = moveInViewOrder(viewOrder, groups, 't1', rowListKey('t1', 'a'), 'z', 'top');
    expect(rowMoved.order[rowListKey('t1', 'a')]).toEqual(['z', 'x', 'y']);
    expect(rowMoved.order[rowListKey('t1', 'b')]).toEqual(['q', 'p']);

    const groupMoved = moveInViewOrder(viewOrder, groups, 't1', groupListKey('t1'), 'b', 'top');
    expect(groupMoved.order[groupListKey('t1')]).toEqual(['b', 'a']);
    expect(groupMoved.order[rowListKey('t1', 'b')]).toEqual(['q', 'p']);
  });

  it('a move keeps saved positions of rows that are not visible right now', () => {
    const viewOrder = {
      ...defaultViewOrder(),
      order: { [rowListKey('t1', 'a')]: ['x', 'gone', 'y'] },
    };
    const moved = moveInViewOrder(viewOrder, groups, 't1', rowListKey('t1', 'a'), 'y', 'top');
    expect(moved.order[rowListKey('t1', 'a')]).toEqual(['y', 'x', 'z', 'gone']);
  });
});

describe('resolveSortMode', () => {
  it('numeric tracks default to My order and keep My order or a column sort', () => {
    expect(resolveSortMode('numeric', null)).toBe('mine');
    expect(resolveSortMode('numeric', 'mine')).toBe('mine');
    expect(resolveSortMode('numeric', { column: 'value', dir: 'asc' })).toEqual({
      column: 'value',
      dir: 'asc',
    });
  });

  it('numeric tracks reject the named modes they do not offer', () => {
    expect(resolveSortMode('numeric', 'alpha')).toBe('mine');
    expect(resolveSortMode('numeric', 'recent')).toBe('mine');
  });

  it('other kinds keep an offered mode and default to their first', () => {
    expect(resolveSortMode('ordinal', null)).toBe('recent');
    expect(resolveSortMode('ordinal', 'alpha')).toBe('alpha');
    expect(resolveSortMode('ordinal', 'mine')).toBe('recent');
  });

  it('categorical offers no sort modes and resolves to My order', () => {
    expect(sortModesForKind('categorical')).toEqual([]);
    expect(resolveSortMode('categorical', null)).toBe('mine');
    expect(resolveSortMode('categorical', 'recent')).toBe('mine');
    expect(resolveSortMode('categorical', 'mine')).toBe('mine');
  });

  it('a column sort chosen on an ordinal or categorical track resolves to that kind default', () => {
    const column = { column: 'band', dir: 'desc' } as const;
    expect(resolveSortMode('ordinal', column)).toBe('recent');
    expect(resolveSortMode('categorical', column)).toBe('mine');
  });
});
