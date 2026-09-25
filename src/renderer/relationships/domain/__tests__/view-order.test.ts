import { describe, it, expect } from 'vitest';
import {
  applyOrder,
  canDrop,
  defaultViewOrder,
  dropPosition,
  moveAfter,
  moveBefore,
  moveDown,
  moveToTop,
  moveUp,
  parseViewOrder,
  serialiseViewOrder,
  type ViewOrder,
} from '../view-order';

describe('applyOrder', () => {
  it('appends unlisted ids alphabetically after listed ones', () => {
    const result = applyOrder(['ccc', 'aaa', 'bbb'], ['bbb'], (a, b) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    expect(result).toEqual(['bbb', 'aaa', 'ccc']);
  });

  it('stale entries (ids no longer present) are ignored, not written back', () => {
    const listed = ['zzz-stale', 'bbb', 'aaa'];
    const result = applyOrder(['aaa', 'bbb'], listed, (a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(result).toEqual(['bbb', 'aaa']);
    // the caller's `listed` array itself is untouched
    expect(listed).toEqual(['zzz-stale', 'bbb', 'aaa']);
  });
});

describe('parse -> apply -> serialise keeps stale entries in the file', () => {
  it('round-trips a stale id without dropping it', () => {
    const raw = {
      version: 1,
      holder: {
        order: { '': ['zzzz-gone', 'aaaa'] },
        expanded: { outer: [], inner: [], track: [] },
      },
      observer: { order: {}, expanded: { outer: [], inner: [], track: [] } },
    };
    const parsed = parseViewOrder(raw);

    const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    const visible = applyOrder(['aaaa', 'bbbb'], parsed.holder.order[''], compare);
    expect(visible).toEqual(['aaaa', 'bbbb']); // stale 'zzzz-gone' skipped when computing what's visible

    // Serialising the parsed (untouched) object keeps the stale id.
    const serialised = JSON.parse(serialiseViewOrder(parsed));
    expect(serialised.holder.order['']).toEqual(['zzzz-gone', 'aaaa']);
  });
});

describe('garbage view-order.json falls back to defaults', () => {
  it.each([
    [null],
    [undefined],
    ['not an object'],
    [42],
    [[]],
    [{ holder: 'nope', observer: 123 }],
    [{ holder: { order: 'nope', expanded: 'nope' } }],
  ])('never throws for %p', (input) => {
    expect(() => parseViewOrder(input)).not.toThrow();
    const result = parseViewOrder(input);
    expect(result).toEqual(defaultViewOrder());
  });

  it('recovers whatever partial shape is well-formed rather than discarding everything', () => {
    const result = parseViewOrder({ holder: { order: { '': ['aaaa'] } } });
    expect(result.holder.order['']).toEqual(['aaaa']);
    expect(result.observer).toEqual(defaultViewOrder().observer);
  });
});

describe('order is stored per grouping mode', () => {
  it('holder and observer sections are independent', () => {
    const order: ViewOrder = defaultViewOrder();
    order.holder.order[''] = ['aaaa', 'bbbb'];
    expect(order.observer.order['']).toBeUndefined();
  });
});

describe('collapse state persists per mode in the same file', () => {
  it('expanded ids round-trip through parse/serialise, per mode', () => {
    const order: ViewOrder = defaultViewOrder();
    order.holder.expanded.outer = ['aaaa'];
    order.observer.expanded.outer = ['bbbb'];

    const roundTripped = parseViewOrder(JSON.parse(serialiseViewOrder(order)));
    expect(roundTripped.holder.expanded.outer).toEqual(['aaaa']);
    expect(roundTripped.observer.expanded.outer).toEqual(['bbbb']);
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

describe('nested rows reorder within their parent only (canDrop)', () => {
  it('accepts a drop within the same mode/level/parent', () => {
    expect(
      canDrop(
        { mode: 'holder', level: 'inner', parentKey: 'aaaa', id: 'bbbb' },
        { mode: 'holder', level: 'inner', parentKey: 'aaaa' },
      ),
    ).toBe(true);
  });

  it('rejects a drop onto a different parent at the same level', () => {
    expect(
      canDrop(
        { mode: 'holder', level: 'inner', parentKey: 'aaaa', id: 'bbbb' },
        { mode: 'holder', level: 'inner', parentKey: 'cccc' },
      ),
    ).toBe(false);
  });

  it('rejects a drop across levels (inner dragged onto an outer target)', () => {
    expect(
      canDrop(
        { mode: 'holder', level: 'inner', parentKey: 'aaaa', id: 'bbbb' },
        { mode: 'holder', level: 'outer', parentKey: '' },
      ),
    ).toBe(false);
  });

  it('rejects a drop across grouping modes', () => {
    expect(
      canDrop(
        { mode: 'holder', level: 'outer', parentKey: '', id: 'aaaa' },
        { mode: 'observer', level: 'outer', parentKey: '' },
      ),
    ).toBe(false);
  });

  it('rejects with no payload', () => {
    expect(canDrop(null, { mode: 'holder', level: 'outer', parentKey: '' })).toBe(false);
  });
});
