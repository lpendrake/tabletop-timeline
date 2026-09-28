import { describe, it, expect } from 'vitest';
import {
  applyOrder,
  applyRowMove,
  canDrop,
  defaultViewOrder,
  dropPosition,
  entityCardsKey,
  groupListKey,
  moveAfter,
  moveBefore,
  moveDown,
  moveToTop,
  moveUp,
  parseViewOrder,
  rowListKey,
  serialiseViewOrder,
  withListOrder,
  withToggledCollapsed,
  withToggledExpanded,
} from '../view-order';

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

describe('list keys', () => {
  it('are built from track + holder', () => {
    expect(rowListKey('rp01', 'aaaa')).toBe('rp01:aaaa');
    expect(groupListKey('rp01')).toBe('rp01:*');
    expect(entityCardsKey('tg01')).toBe('tg01:entity-cards');
  });
});

describe('applyOrder', () => {
  it('appends unlisted ids alphabetically after listed ones', () => {
    expect(applyOrder(['ccc', 'aaa', 'bbb'], ['bbb'], byId)).toEqual(['bbb', 'aaa', 'ccc']);
  });

  it('stale entries (ids no longer present) are ignored, not written back', () => {
    const listed = ['zzz-stale', 'bbb', 'aaa'];
    expect(applyOrder(['aaa', 'bbb'], listed, byId)).toEqual(['bbb', 'aaa']);
    expect(listed).toEqual(['zzz-stale', 'bbb', 'aaa']);
  });
});

describe('stale ids in view-order are ignored and preserved on save', () => {
  it('ignores stale ids for display, keeps them on an untouched round trip, and appends them after a move', () => {
    const parsed = parseViewOrder({
      version: 2,
      order: { 'rp01:aaaa': ['gone', 'bbbb', 'cccc'] },
      expanded: {},
      collapsed: {},
    });
    const visible = applyOrder(['cccc', 'bbbb'], parsed.order['rp01:aaaa'], byId);
    expect(visible).toEqual(['bbbb', 'cccc']);

    const untouched = JSON.parse(serialiseViewOrder(parsed));
    expect(untouched.order['rp01:aaaa']).toEqual(['gone', 'bbbb', 'cccc']);

    const moved = withListOrder(parsed, 'rp01:aaaa', applyRowMove(visible, 'cccc', 'top'));
    expect(moved.order['rp01:aaaa']).toEqual(['cccc', 'bbbb', 'gone']);
    expect(parsed.order['rp01:aaaa']).toEqual(['gone', 'bbbb', 'cccc']); // input not mutated
  });
});

describe('a version-1 or garbage file parses to an empty order', () => {
  it.each([
    [null],
    [undefined],
    ['not an object'],
    [42],
    [[]],
    [{ version: 2, order: 'nope', expanded: 7, collapsed: [] }],
    [{ version: 1, holder: { order: { '': ['aaaa'] } }, observer: {} }],
    [{ holder: { order: {} } }],
  ])('never throws for %p', (input) => {
    expect(() => parseViewOrder(input)).not.toThrow();
    expect(parseViewOrder(input)).toEqual(defaultViewOrder());
  });

  it('keeps well-formed v2 entries and drops non-string ids', () => {
    const result = parseViewOrder({
      version: 2,
      order: { 'rp01:aaaa': ['x', 3, 'y'] },
      expanded: { 'rp01:aaaa': ['x'] },
      collapsed: { 'rp01:*': ['aaaa'] },
    });
    expect(result.order['rp01:aaaa']).toEqual(['x', 'y']);
    expect(result.expanded['rp01:aaaa']).toEqual(['x']);
    expect(result.collapsed['rp01:*']).toEqual(['aaaa']);
  });
});

describe('expand and collapse toggles', () => {
  it('toggle ids under their list key without touching the input', () => {
    const base = defaultViewOrder();
    const expanded = withToggledExpanded(base, 'rp01:aaaa', 'bbbb');
    expect(expanded.expanded['rp01:aaaa']).toEqual(['bbbb']);
    expect(withToggledExpanded(expanded, 'rp01:aaaa', 'bbbb').expanded['rp01:aaaa']).toEqual([]);
    const collapsed = withToggledCollapsed(base, 'rp01:*', 'aaaa');
    expect(collapsed.collapsed['rp01:*']).toEqual(['aaaa']);
    expect(base.expanded).toEqual({});
  });
});

describe('move to top / up / down on a sparse list', () => {
  const visible = ['aaaa', 'bbbb', 'cccc', 'dddd']; // already the resolved, visible sequence

  it('moveToTop moves an id to the front', () => {
    expect(moveToTop(visible, 'cccc')).toEqual(['cccc', 'aaaa', 'bbbb', 'dddd']);
  });

  it('moveToTop is a no-op when already first', () => {
    expect(moveToTop(visible, 'aaaa')).toEqual(visible);
  });

  it('moveToTop is a no-op for an id not in the visible list', () => {
    expect(moveToTop(visible, 'zzzz')).toEqual(visible);
  });

  it('moveUp swaps with the predecessor', () => {
    expect(moveUp(visible, 'cccc')).toEqual(['aaaa', 'cccc', 'bbbb', 'dddd']);
  });

  it('moveUp is a no-op when already first', () => {
    expect(moveUp(visible, 'aaaa')).toEqual(visible);
  });

  it('moveDown swaps with the successor', () => {
    expect(moveDown(visible, 'bbbb')).toEqual(['aaaa', 'cccc', 'bbbb', 'dddd']);
  });

  it('moveDown is a no-op when already last', () => {
    expect(moveDown(visible, 'dddd')).toEqual(visible);
  });

  it('moveBefore places an id just ahead of a target', () => {
    expect(moveBefore(visible, 'dddd', 'bbbb')).toEqual(['aaaa', 'dddd', 'bbbb', 'cccc']);
  });

  it('moveAfter places an id just behind a target', () => {
    expect(moveAfter(visible, 'aaaa', 'cccc')).toEqual(['bbbb', 'cccc', 'aaaa', 'dddd']);
  });

  it('moveBefore/moveAfter are no-ops for an id moved relative to itself', () => {
    expect(moveBefore(visible, 'bbbb', 'bbbb')).toEqual(visible);
    expect(moveAfter(visible, 'bbbb', 'bbbb')).toEqual(visible);
  });
});

describe("dropPosition splits at the row's vertical middle", () => {
  const rect = { top: 100, height: 20 }; // middle at y=110

  it('above the middle is "before"', () => {
    expect(dropPosition(105, rect)).toBe('before');
  });

  it('at or below the middle is "after"', () => {
    expect(dropPosition(110, rect)).toBe('after');
    expect(dropPosition(115, rect)).toBe('after');
  });
});

describe('applyRowMove', () => {
  it('dispatches each move kind', () => {
    const v = ['a', 'b', 'c'];
    expect(applyRowMove(v, 'c', 'top')).toEqual(['c', 'a', 'b']);
    expect(applyRowMove(v, 'b', 'up')).toEqual(['b', 'a', 'c']);
    expect(applyRowMove(v, 'a', 'down')).toEqual(['b', 'a', 'c']);
    expect(applyRowMove(v, 'c', { before: 'a' })).toEqual(['c', 'a', 'b']);
    expect(applyRowMove(v, 'a', { after: 'c' })).toEqual(['b', 'c', 'a']);
  });
});

describe('drop is refused across different list keys', () => {
  it('accepts a drop within the same list', () => {
    expect(canDrop({ listKey: 'rp01:aaaa', id: 'bbbb' }, { listKey: 'rp01:aaaa' })).toBe(true);
  });

  it('refuses a drop onto another holder, another track, or the group list', () => {
    const dragged = { listKey: 'rp01:aaaa', id: 'bbbb' };
    expect(canDrop(dragged, { listKey: 'rp01:cccc' })).toBe(false);
    expect(canDrop(dragged, { listKey: 'at01:aaaa' })).toBe(false);
    expect(canDrop(dragged, { listKey: 'rp01:*' })).toBe(false);
  });

  it('refuses with no payload', () => {
    expect(canDrop(null, { listKey: 'rp01:aaaa' })).toBe(false);
  });
});
