// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { createElement } from 'react';
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

function renderMenu(items: ContextMenuItem[], onClose: () => void) {
  act(() => {
    root.render(createElement(ContextMenu, { items, x: 10, y: 10, onClose }));
  });
}

describe('useContextMenuBehavior — Escape handling', () => {
  beforeEach(() => {
    setup();
  });

  afterEach(() => {
    teardown();
  });

  it('closes the menu on Escape and stops the event before it reaches a document-capture listener', () => {
    const onClose = vi.fn();
    renderMenu([{ kind: 'action', label: 'Item', onSelect: vi.fn() }], onClose);

    // Simulates a modal (or any other ancestor) that listens for Escape on
    // document in the capture phase — e.g. EventEditorModal.
    const documentCaptureListener = vi.fn();
    document.addEventListener('keydown', documentCaptureListener, true);

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');

    act(() => {
      window.dispatchEvent(event);
    });

    document.removeEventListener('keydown', documentCaptureListener, true);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(stopPropagationSpy).toHaveBeenCalledTimes(1);
    // The document-capture listener must never see the event: the menu's
    // window-capture handler consumed it first.
    expect(documentCaptureListener).not.toHaveBeenCalled();
  });

  it('does not call stopPropagation or onClose for a key the menu does not handle', () => {
    const onClose = vi.fn();
    renderMenu([{ kind: 'action', label: 'Item', onSelect: vi.fn() }], onClose);

    // 'Tab' isn't one of the menu's keys (arrows, Enter, Escape, Backspace,
    // or a single printable character), so it must fall through untouched.
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');

    act(() => {
      window.dispatchEvent(event);
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(stopPropagationSpy).not.toHaveBeenCalled();
  });
});
