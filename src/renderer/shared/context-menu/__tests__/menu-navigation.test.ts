import { describe, it, expect, vi } from 'vitest';
import {
  nextNavigableIndex,
  firstNavigableIndex,
  itemAtPath,
  itemsAtPath,
  isPathPrefix,
} from '../menu-navigation';
import type { ContextMenuItem } from '../types';

function items(): ContextMenuItem[] {
  return [
    { kind: 'header', label: 'Section' },
    { kind: 'action', label: 'A', onSelect: vi.fn() },
    { kind: 'separator' },
    { kind: 'action', label: 'B', onSelect: vi.fn(), disabled: true },
    { kind: 'action', label: 'C', onSelect: vi.fn() },
  ];
}

describe('menu-navigation', () => {
  it('skips separators, headers and disabled, and wraps', () => {
    const list = items();
    const first = firstNavigableIndex(list);
    expect(first).toBe(1); // 'A'

    const next1 = nextNavigableIndex(list, first!, 1);
    expect(next1).toBe(4); // skips separator and disabled 'B', lands on 'C'

    const next2 = nextNavigableIndex(list, next1!, 1);
    expect(next2).toBe(1); // wraps back to 'A'

    const prev1 = nextNavigableIndex(list, first!, -1);
    expect(prev1).toBe(4); // wraps backward to 'C'
  });

  it('returns null when nothing is navigable', () => {
    const list: ContextMenuItem[] = [{ kind: 'separator' }, { kind: 'header', label: 'X' }];
    expect(firstNavigableIndex(list)).toBeNull();
    expect(nextNavigableIndex(list, -1, 1)).toBeNull();
  });

  it('itemsAtPath / itemAtPath walk into nested submenus', () => {
    const tree: ContextMenuItem[] = [
      {
        kind: 'submenu',
        label: 'Formatting',
        items: [{ kind: 'action', label: 'Bold', onSelect: vi.fn() }],
      },
    ];
    expect(itemsAtPath(tree, [0])).toEqual(tree[0].kind === 'submenu' ? tree[0].items : []);
    expect(itemAtPath(tree, [0, 0])).toEqual((tree[0] as { items: ContextMenuItem[] }).items[0]);
    expect(itemsAtPath(tree, [0, 5])).toBeNull();
  });

  it('isPathPrefix', () => {
    expect(isPathPrefix([0], [0, 1])).toBe(true);
    expect(isPathPrefix([0, 1], [0, 1])).toBe(true);
    expect(isPathPrefix([1], [0, 1])).toBe(false);
    expect(isPathPrefix([0, 1], [0])).toBe(false);
  });
});
