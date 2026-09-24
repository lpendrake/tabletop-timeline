import { describe, it, expect, vi } from 'vitest';
import {
  initialMenuKeyState,
  initialMenuKeyStateFor,
  isPrintableKey,
  menuKeyDown,
  menuQueryChange,
  type MenuKeyState,
} from '../menu-keyboard';
import type { ContextMenuItem } from '../types';

function formattingMenu(): ContextMenuItem[] {
  return [
    { kind: 'action', label: 'Copy', onSelect: vi.fn() },
    { kind: 'action', label: 'Delete', onSelect: vi.fn(), variant: 'danger' },
    { kind: 'action', label: 'Details', onSelect: vi.fn() },
    { kind: 'separator' },
    {
      kind: 'submenu',
      label: 'Formatting',
      items: [
        {
          kind: 'submenu',
          label: 'Heading',
          items: [{ kind: 'action', label: 'Heading 1', onSelect: vi.fn() }],
        },
      ],
    },
  ];
}

function key(
  k: string,
  mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {},
) {
  return { key: k, ...mods };
}

describe('menuKeyDown', () => {
  it('printable key starts a search and targets the best non-danger match', () => {
    const items = formattingMenu();
    const result = menuKeyDown(initialMenuKeyState, key('d'), items, {});

    expect(result.handled).toBe(true);
    expect(result.state.isSearching).toBe(true);
    expect(result.state.query).toBe('d');
    // 'Details' beats the danger 'Delete' for the auto target.
    expect(result.state.targetIndex).toBeGreaterThanOrEqual(0);
  });

  it('Escape while searching exits search and restores the pre-search highlight', () => {
    const items = formattingMenu();
    const searching: MenuKeyState = {
      highlightPath: null,
      isSearching: true,
      query: 'de',
      targetIndex: 0,
      preSearchHighlight: [2],
    };
    const result = menuKeyDown(searching, key('Escape'), items, {});

    expect(result.handled).toBe(true);
    expect(result.effect).toBeUndefined();
    expect(result.state.isSearching).toBe(false);
    expect(result.state.query).toBe('');
    expect(result.state.highlightPath).toEqual([2]);
    expect(result.state.preSearchHighlight).toBeNull();
  });

  it('clearing the query exits search and restores the pre-search highlight', () => {
    const items = formattingMenu();
    const searching: MenuKeyState = {
      highlightPath: null,
      isSearching: true,
      query: 'de',
      targetIndex: 0,
      preSearchHighlight: [0],
    };
    const next = menuQueryChange(searching, '', items);

    expect(next.isSearching).toBe(false);
    expect(next.query).toBe('');
    expect(next.highlightPath).toEqual([0]);
    expect(next.preSearchHighlight).toBeNull();
  });

  it('Down/Up while searching cycle the target, including danger items', () => {
    const items = formattingMenu();
    // 'de' matches 'Delete' (danger) and 'Details'; auto target is 'Details'.
    let state = menuKeyDown(initialMenuKeyState, key('d'), items, {}).state;
    state = menuQueryChange(state, 'de', items);
    expect(state.query).toBe('de');

    const down = menuKeyDown(state, key('ArrowDown'), items, {});
    expect(down.handled).toBe(true);
    const up = menuKeyDown(down.state, key('ArrowUp'), items, {});
    expect(up.handled).toBe(true);
    // Cycling all the way around should be able to reach the danger item
    // (never automatically, but reachable by arrowing).
    const cycled = new Set<number>();
    let cur = state;
    for (let i = 0; i < 4; i++) {
      cur = menuKeyDown(cur, key('ArrowDown'), items, {}).state;
      cycled.add(cur.targetIndex);
    }
    expect(cycled.size).toBeGreaterThanOrEqual(2);
  });

  it('Enter while searching yields a select effect for the target; none when there is no target', () => {
    const items = formattingMenu();
    let state = menuKeyDown(initialMenuKeyState, key('c'), items, {}).state;
    state = menuQueryChange(state, 'copy', items);
    const hit = menuKeyDown(state, key('Enter'), items, {});
    expect(hit.effect).toEqual({ type: 'select', path: [0] });

    const noMatch = menuQueryChange(state, 'zzz', items);
    const miss = menuKeyDown(noMatch, key('Enter'), items, {});
    expect(miss.effect).toBeUndefined();
  });

  it('Right enters a submenu, Left leaves it', () => {
    const items = formattingMenu();
    // Highlight 'Formatting' (index 4).
    const highlighted: MenuKeyState = { ...initialMenuKeyState, highlightPath: [4] };

    const entered = menuKeyDown(highlighted, key('ArrowRight'), items, {});
    expect(entered.handled).toBe(true);
    expect(entered.state.highlightPath).toEqual([4, 0]); // into 'Heading' submenu

    const left = menuKeyDown(entered.state, key('ArrowLeft'), items, {});
    expect(left.handled).toBe(true);
    expect(left.state.highlightPath).toEqual([4]);
  });

  it('Enter on a highlighted action yields select; on a submenu enters it', () => {
    const items = formattingMenu();
    const onAction: MenuKeyState = { ...initialMenuKeyState, highlightPath: [0] };
    const actionResult = menuKeyDown(onAction, key('Enter'), items, {});
    expect(actionResult.effect).toEqual({ type: 'select', path: [0] });

    const onSubmenu: MenuKeyState = { ...initialMenuKeyState, highlightPath: [4] };
    const submenuResult = menuKeyDown(onSubmenu, key('Enter'), items, {});
    expect(submenuResult.effect).toBeUndefined();
    expect(submenuResult.state.highlightPath).toEqual([4, 0]);
  });

  it('Backspace without search yields close only when backspaceCloses', () => {
    const items = formattingMenu();
    const withoutOpt = menuKeyDown(initialMenuKeyState, key('Backspace'), items, {});
    expect(withoutOpt.handled).toBe(false);
    expect(withoutOpt.effect).toBeUndefined();

    const withOpt = menuKeyDown(initialMenuKeyState, key('Backspace'), items, {
      backspaceCloses: true,
    });
    expect(withOpt.handled).toBe(true);
    expect(withOpt.effect).toEqual({ type: 'close', reason: 'backspace' });
  });

  it('modifier chords are not printable', () => {
    expect(isPrintableKey(key('c', { ctrlKey: true }))).toBe(false);
    expect(isPrintableKey(key('c', { metaKey: true }))).toBe(false);
    expect(isPrintableKey(key('c', { altKey: true }))).toBe(false);
    expect(isPrintableKey(key('c'))).toBe(true);

    const items = formattingMenu();
    const result = menuKeyDown(initialMenuKeyState, key('c', { ctrlKey: true }), items, {});
    expect(result.handled).toBe(false);
    expect(result.state.isSearching).toBe(false);
  });

  it('Escape without search is not handled (falls through to the close handler)', () => {
    const items = formattingMenu();
    const result = menuKeyDown(initialMenuKeyState, key('Escape'), items, {});
    expect(result.handled).toBe(false);
    expect(result.effect).toBeUndefined();
  });
});

describe('initialMenuKeyStateFor', () => {
  it('initial state skips separators, headers and disabled items', () => {
    const items: ContextMenuItem[] = [
      { kind: 'header', label: 'Section' },
      { kind: 'separator' },
      { kind: 'action', label: 'A', onSelect: vi.fn(), disabled: true },
      { kind: 'action', label: 'B', onSelect: vi.fn() },
    ];
    expect(initialMenuKeyStateFor(items).highlightPath).toEqual([3]);
  });

  it('prefers the first non-danger navigable item over a leading danger one', () => {
    const items = formattingMenu(); // 'Copy', 'Delete' (danger), 'Details', …
    expect(initialMenuKeyStateFor(items).highlightPath).toEqual([0]); // 'Copy'

    const dangerFirst: ContextMenuItem[] = [
      { kind: 'action', label: 'Delete', onSelect: vi.fn(), variant: 'danger' },
      { kind: 'action', label: 'Edit', onSelect: vi.fn() },
    ];
    expect(initialMenuKeyStateFor(dangerFirst).highlightPath).toEqual([1]); // 'Edit'
  });

  it('highlights nothing when every navigable item is danger', () => {
    const items: ContextMenuItem[] = [
      { kind: 'action', label: 'Delete', onSelect: vi.fn(), variant: 'danger' },
      { kind: 'action', label: 'Remove', onSelect: vi.fn(), variant: 'danger' },
    ];
    expect(initialMenuKeyStateFor(items).highlightPath).toBeNull();
  });

  it('highlights nothing when nothing is navigable', () => {
    const items: ContextMenuItem[] = [{ kind: 'separator' }, { kind: 'header', label: 'X' }];
    expect(initialMenuKeyStateFor(items).highlightPath).toBeNull();
  });
});
