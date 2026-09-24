// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { act } from 'react';
import {
  isContextMenuOpen,
  onContextMenuOpenChange,
  registerContextMenuOpen,
  _resetContextMenuPresenceForTests,
} from '../context-menu-presence';
import { ContextMenu } from '../context-menu';
import { showContextMenu } from '../show';

afterEach(() => {
  document.querySelectorAll('.context-menu').forEach((el) => el.remove());
  _resetContextMenuPresenceForTests();
});

describe('isContextMenuOpen', () => {
  it('reflects mounted menus, including in-tree <ContextMenu>', () => {
    expect(isContextMenuOpen()).toBe(false);

    const container: HTMLDivElement = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    act(() => {
      root.render(createElement(ContextMenu, { items: [], x: 0, y: 0, onClose: () => {} }));
    });

    expect(isContextMenuOpen()).toBe(true);

    act(() => root.unmount());
    container.remove();

    expect(isContextMenuOpen()).toBe(false);
  });

  it('reflects a menu opened via showContextMenu', async () => {
    expect(isContextMenuOpen()).toBe(false);

    let handle: ReturnType<typeof showContextMenu>;
    act(() => {
      handle = showContextMenu([], 0, 0);
    });
    expect(isContextMenuOpen()).toBe(true);

    await act(async () => {
      handle!.close();
      // showContextMenu tears down its root on a microtask.
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(isContextMenuOpen()).toBe(false);
  });

  it('is true while a directly-registered menu is open and false after it unregisters', () => {
    expect(isContextMenuOpen()).toBe(false);
    const unregister = registerContextMenuOpen();
    expect(isContextMenuOpen()).toBe(true);
    unregister();
    expect(isContextMenuOpen()).toBe(false);
  });

  it('is true regardless of what currently has focus', () => {
    const unregister = registerContextMenuOpen();
    (document.activeElement as HTMLElement | null)?.blur?.();

    expect(document.activeElement).toBe(document.body);
    expect(isContextMenuOpen()).toBe(true);

    unregister();
  });
});

describe('onContextMenuOpenChange', () => {
  it('notifies on first open and last close, not on every intermediate register/unregister', () => {
    const calls: boolean[] = [];
    const unsubscribe = onContextMenuOpenChange((open) => calls.push(open));

    const closeFirst = registerContextMenuOpen();
    expect(calls).toEqual([true]); // 0 -> 1: notified

    const closeSecond = registerContextMenuOpen();
    expect(calls).toEqual([true]); // 1 -> 2: not notified again

    closeFirst();
    expect(calls).toEqual([true]); // 2 -> 1: still open, not notified

    closeSecond();
    expect(calls).toEqual([true, false]); // 1 -> 0: notified

    unsubscribe();
  });

  it("reports the closed state exactly, even a tick before a closing menu's DOM node is removed", () => {
    // Mirrors how a real `<ContextMenu>` unmounts: the effect cleanup that
    // unregisters can run slightly before its `.context-menu` node is
    // detached. The registry-based listener must not be fooled by the node
    // still being in the document at that instant.
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    document.body.appendChild(menu);
    const unregister = registerContextMenuOpen();

    const calls: boolean[] = [];
    onContextMenuOpenChange((open) => calls.push(open));

    unregister(); // DOM node is still attached at this point
    expect(calls).toEqual([false]);

    menu.remove();
  });

  it('stops notifying after unsubscribe', () => {
    const calls: boolean[] = [];
    const unsubscribe = onContextMenuOpenChange((open) => calls.push(open));
    unsubscribe();

    const close = registerContextMenuOpen();
    close();

    expect(calls).toEqual([]);
  });
});
