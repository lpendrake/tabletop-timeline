import { describe, expect, it } from 'vitest';
import type { Ledger } from '../../../../shared/relationships/model';
import { sortModesForKind } from '../sort';
import {
  buildHolderPicker,
  moveInViewOrder,
  resolveSortMode,
  visibleIdsForList,
} from '../view-state';
import { defaultViewOrder, entityCardsKey, groupListKey, rowListKey } from '../view-order';

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

describe('entity-cards order', () => {
  const key = entityCardsKey('t1');

  it('moving an entity card rewrites only the entity-cards list', () => {
    const viewOrder = {
      ...defaultViewOrder(),
      order: { [rowListKey('t1', 'a')]: ['x', 'y'], [groupListKey('t1')]: ['a', 'b'] },
    };
    const moved = moveInViewOrder(viewOrder, [], 't1', key, 'c', 'top', ['a', 'b', 'c']);
    expect(moved.order[key]).toEqual(['c', 'a', 'b']);
    expect(moved.order[rowListKey('t1', 'a')]).toEqual(['x', 'y']);
    expect(moved.order[groupListKey('t1')]).toEqual(['a', 'b']);
    expect(visibleIdsForList([], 't1', key, ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('moving an entity card keeps saved positions for entities that have no card right now', () => {
    const viewOrder = { ...defaultViewOrder(), order: { [key]: ['a', 'gone', 'b'] } };
    const moved = moveInViewOrder(viewOrder, [], 't1', key, 'b', 'top', ['a', 'b']);
    expect(moved.order[key]).toEqual(['b', 'a', 'gone']);
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
