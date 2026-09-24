// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { ContextMenu } from '../context-menu';
import type { ContextMenuItem, ContextMenuCloseReason } from '../types';

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

function renderMenu(
  items: ContextMenuItem[],
  props: Partial<{
    onClose: (reason?: ContextMenuCloseReason) => void;
    restoreFocus: () => void;
    backspaceCloses: boolean;
  }> = {},
) {
  const onClose = props.onClose ?? vi.fn();
  act(() => {
    root.render(
      <ContextMenu
        items={items}
        x={10}
        y={10}
        onClose={onClose}
        restoreFocus={props.restoreFocus}
        backspaceCloses={props.backspaceCloses}
      />,
    );
  });
  return onClose;
}

function panel(): HTMLElement {
  return container.querySelector('.context-menu') as HTMLElement;
}

function searchInput(): HTMLInputElement | null {
  return container.querySelector('.context-menu-search-input');
}

function typeChar(char: string) {
  act(() => {
    const event = new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true });
    window.dispatchEvent(event);
  });
}

function pressKey(key: string, target: EventTarget = window) {
  act(() => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    if (target !== window) {
      target.dispatchEvent(event);
    } else {
      window.dispatchEvent(event);
    }
  });
}

function formattingMenu(onSelectHeading1 = vi.fn()): ContextMenuItem[] {
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
          items: [{ kind: 'action', label: 'Heading 1', onSelect: onSelectHeading1 }],
        },
      ],
    },
  ];
}

describe('ContextMenu — focus and search', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('takes focus on open and shows no search box until the first keystroke', () => {
    renderMenu([{ kind: 'action', label: 'Item', onSelect: vi.fn() }]);
    expect(panel().contains(document.activeElement)).toBe(true);
    expect(searchInput()).toBeNull();

    typeChar('h');

    const input = searchInput();
    expect(input).not.toBeNull();
    expect(input!.value).toBe('h');
  });

  it('the first non-danger item is highlighted when the menu opens', () => {
    const onSelectAlpha = vi.fn();
    const onClose = renderMenu([
      { kind: 'action', label: 'Alpha', onSelect: onSelectAlpha },
      { kind: 'action', label: 'Beta', onSelect: vi.fn() },
    ]);

    const highlighted = container.querySelector('.context-menu-item--highlighted');
    expect(highlighted?.textContent).toBe('Alpha');

    pressKey('Enter');

    expect(onSelectAlpha).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith('select');
  });

  it('a leading danger item is not pre-highlighted', () => {
    renderMenu([
      { kind: 'action', label: 'Delete', onSelect: vi.fn(), variant: 'danger' },
      { kind: 'action', label: 'Edit', onSelect: vi.fn() },
    ]);

    const highlighted = container.querySelector('.context-menu-item--highlighted');
    expect(highlighted?.textContent).toBe('Edit');
  });

  it('after Escape clears the search, focus is back on the menu and typing starts a new search', () => {
    renderMenu([
      { kind: 'action', label: 'Create event', onSelect: vi.fn() },
      { kind: 'action', label: 'Create session', onSelect: vi.fn() },
      { kind: 'action', label: 'Set now', onSelect: vi.fn() },
    ]);

    typeChar('x');
    expect(searchInput()).not.toBeNull();

    pressKey('Escape');
    expect(searchInput()).toBeNull();
    expect(panel().contains(document.activeElement)).toBe(true);

    typeChar('a');

    const input = searchInput();
    expect(input).not.toBeNull();
    expect(input!.value).toBe('a');
    expect(panel().contains(document.activeElement)).toBe(true);
  });

  it('same after backspacing the search to empty', () => {
    renderMenu([
      { kind: 'action', label: 'Create event', onSelect: vi.fn() },
      { kind: 'action', label: 'Create session', onSelect: vi.fn() },
      { kind: 'action', label: 'Set now', onSelect: vi.fn() },
    ]);

    typeChar('x');
    fireEvent.change(searchInput()!, { target: { value: '' } });
    expect(searchInput()).toBeNull();
    expect(panel().contains(document.activeElement)).toBe(true);

    typeChar('d');

    const input = searchInput();
    expect(input).not.toBeNull();
    expect(input!.value).toBe('d');
    expect(panel().contains(document.activeElement)).toBe(true);
  });

  it('typing shows the target echo with its path and Enter clicks it', () => {
    const onSelectHeading1 = vi.fn();
    const onClose = renderMenu(formattingMenu(onSelectHeading1));

    typeChar('h');
    fireEvent.change(searchInput()!, { target: { value: 'hea' } });

    const echo = container.querySelector('.context-menu-search-echo');
    expect(echo?.textContent).toContain('Formatting › Heading › Heading 1');

    pressKey('Enter');

    expect(onSelectHeading1).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith('select');
  });

  it('Down moves the target through the matches', () => {
    const items: ContextMenuItem[] = [
      { kind: 'action', label: 'Bold', onSelect: vi.fn() },
      { kind: 'action', label: 'Blockquote', onSelect: vi.fn() },
    ];
    renderMenu(items);
    typeChar('b');

    const firstEcho = container.querySelector('.context-menu-search-echo')?.textContent;
    expect(firstEcho).toBe('Bold');

    pressKey('ArrowDown');

    const secondEcho = container.querySelector('.context-menu-search-echo')?.textContent;
    expect(secondEcho).toBe('Blockquote');
  });

  it("typing 'de' and Enter never selects a danger item", () => {
    const onDelete = vi.fn();
    const items: ContextMenuItem[] = [
      { kind: 'action', label: 'Delete', onSelect: onDelete, variant: 'danger' },
      { kind: 'action', label: 'Details', onSelect: vi.fn() },
    ];
    renderMenu(items);
    typeChar('d');
    fireEvent.change(searchInput()!, { target: { value: 'de' } });

    pressKey('Enter');

    expect(onDelete).not.toHaveBeenCalled();
  });

  it("no matches shows 'No matches' and Enter does nothing", () => {
    const onSelect = vi.fn();
    renderMenu([{ kind: 'action', label: 'Item', onSelect }]);
    typeChar('z');
    fireEvent.change(searchInput()!, { target: { value: 'zzz' } });

    const echo = container.querySelector('.context-menu-search-echo');
    expect(echo?.textContent).toBe('No matches');

    pressKey('Enter');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('Escape with search open restores the full menu and pre-search highlight; second Escape closes', () => {
    const items: ContextMenuItem[] = [
      { kind: 'action', label: 'Alpha', onSelect: vi.fn() },
      { kind: 'action', label: 'Beta', onSelect: vi.fn() },
      { kind: 'action', label: 'Gamma', onSelect: vi.fn() },
    ];
    const onClose = renderMenu(items);

    // 'Alpha' is already highlighted on open; one Down moves to 'Beta'.
    pressKey('ArrowDown');
    let highlighted = container.querySelector('.context-menu-item--highlighted');
    expect(highlighted?.textContent).toBe('Beta');

    typeChar('a');
    expect(searchInput()).not.toBeNull();

    pressKey('Escape');

    expect(searchInput()).toBeNull();
    highlighted = container.querySelector('.context-menu-item--highlighted');
    expect(highlighted?.textContent).toBe('Beta');
    expect(onClose).not.toHaveBeenCalled();

    pressKey('Escape');
    expect(onClose).toHaveBeenCalledWith('escape');
  });

  it('backspacing the search to empty restores the pre-search highlight', () => {
    const items: ContextMenuItem[] = [
      { kind: 'action', label: 'Alpha', onSelect: vi.fn() },
      { kind: 'action', label: 'Beta', onSelect: vi.fn() },
    ];
    renderMenu(items);

    // 'Alpha' is already highlighted on open.
    expect(container.querySelector('.context-menu-item--highlighted')?.textContent).toBe('Alpha');

    typeChar('a');
    fireEvent.change(searchInput()!, { target: { value: '' } });

    expect(searchInput()).toBeNull();
    expect(container.querySelector('.context-menu-item--highlighted')?.textContent).toBe('Alpha');
  });

  it('Up/Down/Right/Left/Enter navigate without searching', () => {
    const onSelectLeaf = vi.fn();
    const items: ContextMenuItem[] = [
      { kind: 'action', label: 'Alpha', onSelect: vi.fn() },
      {
        kind: 'submenu',
        label: 'More',
        items: [{ kind: 'action', label: 'Leaf', onSelect: onSelectLeaf }],
      },
    ];
    renderMenu(items);

    // 'Alpha' is already highlighted on open; one Down moves to 'More'.
    pressKey('ArrowDown'); // More
    expect(container.querySelector('.context-menu-item--highlighted')?.textContent).toContain(
      'More',
    );

    pressKey('ArrowRight'); // enters 'More', highlights 'Leaf'
    expect(container.querySelector('.context-menu-item--highlighted')?.textContent).toBe('Leaf');

    pressKey('ArrowLeft'); // back to 'More'
    expect(container.querySelector('.context-menu-item--highlighted')?.textContent).toContain(
      'More',
    );

    pressKey('ArrowRight');
    pressKey('Enter');
    expect(onSelectLeaf).toHaveBeenCalledTimes(1);
  });

  it('focus returns to its origin on close, or to restoreFocus when provided', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    const onClose = renderMenu([{ kind: 'action', label: 'Item', onSelect: vi.fn() }]);
    expect(document.activeElement).not.toBe(input);

    pressKey('Escape');
    expect(onClose).toHaveBeenCalledWith('escape');
    teardown();
    setup();
    expect(document.activeElement).toBe(input);
    input.remove();

    const restoreFocus = vi.fn();
    renderMenu([{ kind: 'action', label: 'Item', onSelect: vi.fn() }], { restoreFocus });
    pressKey('Escape');
    expect(restoreFocus).toHaveBeenCalledTimes(1);
  });

  it('restoreFocus runs before onSelect', () => {
    const log: string[] = [];
    const restoreFocus = vi.fn(() => log.push('restoreFocus'));
    const onSelect = vi.fn(() => log.push('onSelect'));
    renderMenu([{ kind: 'action', label: 'Item', onSelect }], { restoreFocus });

    fireEvent.click(
      Array.from(container.querySelectorAll('button.context-menu-item')).find(
        (b) => b.textContent === 'Item',
      )!,
    );

    expect(log).toEqual(['restoreFocus', 'onSelect']);
  });

  it('backspace with no search closes only when backspaceCloses', () => {
    const onCloseNoOpt = renderMenu([{ kind: 'action', label: 'Item', onSelect: vi.fn() }]);
    pressKey('Backspace');
    expect(onCloseNoOpt).not.toHaveBeenCalled();

    teardown();
    setup();

    const onCloseWithOpt = renderMenu([{ kind: 'action', label: 'Item', onSelect: vi.fn() }], {
      backspaceCloses: true,
    });
    pressKey('Backspace');
    expect(onCloseWithOpt).toHaveBeenCalledWith('backspace');
  });

  it('Escape inside the menu (with or without search) never reaches a document capture listener', () => {
    const onClose = renderMenu([{ kind: 'action', label: 'Item', onSelect: vi.fn() }]);
    const documentCaptureListener = vi.fn();
    document.addEventListener('keydown', documentCaptureListener, true);

    typeChar('i');
    pressKey('Escape'); // closes search, not the menu
    expect(onClose).not.toHaveBeenCalled();
    expect(documentCaptureListener).not.toHaveBeenCalled();

    pressKey('Escape'); // closes the menu
    expect(onClose).toHaveBeenCalledWith('escape');
    expect(documentCaptureListener).not.toHaveBeenCalled();

    document.removeEventListener('keydown', documentCaptureListener, true);
  });

  it('outside mousedown closes with reason outside', () => {
    const onClose = renderMenu([{ kind: 'action', label: 'Item', onSelect: vi.fn() }]);
    act(() => {
      const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'target', { value: document.body, writable: false });
      document.body.dispatchEvent(event);
    });
    expect(onClose).toHaveBeenCalledWith('outside');
  });
});
