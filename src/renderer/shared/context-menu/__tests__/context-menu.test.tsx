// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { ContextMenu } from '../context-menu';
import type { ContextMenuItem } from '../types';

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

function renderMenu(items: ContextMenuItem[], onClose: () => void = vi.fn()) {
  act(() => {
    root.render(<ContextMenu items={items} x={10} y={10} onClose={onClose} />);
  });
  return onClose;
}

function findActionButton(label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button.context-menu-item')).find(
    (b) => b.textContent?.trim() === label,
  );
}

function findSubmenuWrap(label: string): HTMLElement {
  const wraps = Array.from(container.querySelectorAll<HTMLElement>('.context-menu-submenu-wrap'));
  const wrap = wraps.find((w) => {
    const row = Array.from(w.children).find((c) =>
      c.classList.contains('context-menu-item--submenu'),
    );
    return row?.textContent?.includes(label);
  });
  if (!wrap) throw new Error(`submenu wrap not found for label: ${label}`);
  return wrap;
}

function hoverSubmenu(label: string) {
  const wrap = findSubmenuWrap(label);
  act(() => {
    fireEvent.mouseEnter(wrap);
  });
}

describe('ContextMenu', () => {
  beforeEach(() => {
    setup();
  });

  afterEach(() => {
    teardown();
  });

  it('renders action rows and firing one calls onSelect and closes the menu', () => {
    const onSelectA = vi.fn();
    const onSelectB = vi.fn();
    const onClose = renderMenu([
      { kind: 'action', label: 'Item A', onSelect: onSelectA },
      { kind: 'action', label: 'Item B', onSelect: onSelectB },
    ]);

    expect(findActionButton('Item A')).not.toBeUndefined();
    expect(findActionButton('Item B')).not.toBeUndefined();

    act(() => {
      fireEvent.click(findActionButton('Item A')!);
    });

    expect(onSelectA).toHaveBeenCalledTimes(1);
    expect(onSelectB).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders a separator and a non-clickable header', () => {
    const onClose = renderMenu([
      { kind: 'header', label: 'Section' },
      { kind: 'separator' },
      { kind: 'action', label: 'Item', onSelect: vi.fn() },
    ]);

    const header = container.querySelector('.context-menu-header');
    expect(header).not.toBeNull();
    expect(header!.textContent).toBe('Section');
    expect(header!.tagName).not.toBe('BUTTON');

    const sep = container.querySelector('.context-menu-sep');
    expect(sep).not.toBeNull();

    // Header has no click handler at all — clicking it must not close the menu.
    act(() => {
      fireEvent.click(header!);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a disabled action is rendered greyed and clicking it does nothing', () => {
    const onSelect = vi.fn();
    const onClose = renderMenu([{ kind: 'action', label: 'Delete', onSelect, disabled: true }]);

    const btn = findActionButton('Delete')!;
    expect(btn).not.toBeUndefined();
    expect(btn.className).toContain('context-menu-item--disabled');
    expect(btn.disabled).toBe(true);

    act(() => {
      fireEvent.click(btn);
    });

    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('hovering a submenu opens it and renders its children', () => {
    renderMenu([
      {
        kind: 'submenu',
        label: 'More',
        items: [{ kind: 'action', label: 'Child A', onSelect: vi.fn() }],
      },
    ]);

    expect(findActionButton('Child A')).toBeUndefined();

    hoverSubmenu('More');

    expect(findActionButton('Child A')).not.toBeUndefined();
  });

  it('a 3-level-deep nested submenu chain renders and the leaf is selectable', () => {
    const onSelectLeaf = vi.fn();
    const onClose = renderMenu([
      {
        kind: 'submenu',
        label: 'Level 1',
        items: [
          {
            kind: 'submenu',
            label: 'Level 2',
            items: [
              {
                kind: 'submenu',
                label: 'Level 3',
                items: [{ kind: 'action', label: 'Leaf', onSelect: onSelectLeaf }],
              },
            ],
          },
        ],
      },
    ]);

    hoverSubmenu('Level 1');
    hoverSubmenu('Level 2');
    hoverSubmenu('Level 3');

    const leaf = findActionButton('Leaf');
    expect(leaf).not.toBeUndefined();

    act(() => {
      fireEvent.click(leaf!);
    });

    expect(onSelectLeaf).toHaveBeenCalledTimes(1);
    // Selecting a deeply nested leaf closes the whole tree, not just its submenu.
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a disabled submenu does not open on hover', () => {
    renderMenu([
      {
        kind: 'submenu',
        label: 'More',
        disabled: true,
        items: [{ kind: 'action', label: 'Child A', onSelect: vi.fn() }],
      },
    ]);

    hoverSubmenu('More');

    expect(findActionButton('Child A')).toBeUndefined();
  });

  it('pressing Escape (and outside click) closes the whole tree', () => {
    const onCloseEscape = renderMenu([
      {
        kind: 'submenu',
        label: 'More',
        items: [{ kind: 'action', label: 'Child A', onSelect: vi.fn() }],
      },
    ]);
    hoverSubmenu('More');
    expect(findActionButton('Child A')).not.toBeUndefined();

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    });
    expect(onCloseEscape).toHaveBeenCalledTimes(1);

    teardown();
    setup();

    const onCloseOutsideClick = renderMenu([{ kind: 'action', label: 'Item', onSelect: vi.fn() }]);
    act(() => {
      const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'target', { value: document.body, writable: false });
      document.body.dispatchEvent(event);
    });
    expect(onCloseOutsideClick).toHaveBeenCalledTimes(1);
  });
});
