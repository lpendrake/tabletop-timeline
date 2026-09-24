// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { act } from 'react';
import { useTimelineKeyboard, type TimelineKeyboardDeps } from '../useTimelineKeyboard';
import { isContextMenuFocused } from '../../../shared/context-menu';

let container: HTMLDivElement;
let root: Root;

function setup() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
}

function teardown() {
  act(() => root.unmount());
  container.remove();
}

function Harness({ deps }: { deps: TimelineKeyboardDeps }) {
  useTimelineKeyboard(deps);
  return null;
}

function makeDeps(overrides: Partial<TimelineKeyboardDeps> = {}): TimelineKeyboardDeps {
  return {
    isBlocked: () => isContextMenuFocused(),
    getView: () => ({ centerSeconds: 0, secondsPerPixel: 60 }),
    getSize: () => ({ width: 1000, height: 600 }),
    setView: vi.fn(),
    getEvents: () => [],
    getFocusedFilename: () => null,
    expandEvent: vi.fn(),
    collapse: vi.fn(),
    quickAddShowAt: vi.fn(),
    quickAddHide: vi.fn(),
    createEventAt: vi.fn(),
    ...overrides,
  };
}

describe('useTimelineKeyboard while a context menu is focused', () => {
  beforeEach(() => {
    setup();
  });

  afterEach(() => {
    teardown();
  });

  it('ignores a keydown whose target is inside a focused .context-menu panel', () => {
    const setView = vi.fn();
    const deps = makeDeps({ setView });
    act(() => {
      root.render(createElement(Harness, { deps }));
    });

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.tabIndex = -1;
    document.body.appendChild(menu);
    menu.focus();
    expect(document.activeElement).toBe(menu);

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'd', bubbles: true, cancelable: true });
      Object.defineProperty(event, 'target', { value: menu, writable: false });
      menu.dispatchEvent(event);
    });

    expect(setView).not.toHaveBeenCalled();

    menu.remove();
  });

  it('still navigates when nothing inside a context menu has focus', () => {
    const setView = vi.fn();
    const deps = makeDeps({ setView });
    act(() => {
      root.render(createElement(Harness, { deps }));
    });

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'd', bubbles: true, cancelable: true });
      window.dispatchEvent(event);
    });

    expect(setView).toHaveBeenCalled();
  });
});
