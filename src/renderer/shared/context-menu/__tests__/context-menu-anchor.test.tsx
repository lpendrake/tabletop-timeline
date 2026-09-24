// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
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

function panel(): HTMLElement {
  return container.querySelector('.context-menu') as HTMLElement;
}

const LINE_RECT = { top: 100, left: 50, right: 150, bottom: 120, width: 100, height: 20 };

describe('ContextMenu — caret anchor', () => {
  beforeEach(() => {
    setup();
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
  });

  afterEach(() => {
    teardown();
  });

  it('places the menu below the line when preferring below', () => {
    HTMLElement.prototype.getBoundingClientRect = vi.fn(() => ({
      width: 200,
      height: 100,
      top: 0,
      left: 0,
      right: 200,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })) as unknown as typeof HTMLElement.prototype.getBoundingClientRect;

    const items: ContextMenuItem[] = [{ kind: 'action', label: 'Item', onSelect: vi.fn() }];
    act(() => {
      root.render(
        <ContextMenu
          items={items}
          x={0}
          y={0}
          onClose={vi.fn()}
          anchor={{ lineRect: LINE_RECT, prefer: 'below' }}
        />,
      );
    });

    expect(panel().style.top).not.toBe('');
    expect(panel().style.bottom).toBe('');
  });

  it('places the menu above the line when preferring above, and keeps that side as height grows', () => {
    let height = 100;
    HTMLElement.prototype.getBoundingClientRect = vi.fn(() => ({
      width: 200,
      height,
      top: 0,
      left: 0,
      right: 200,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })) as unknown as typeof HTMLElement.prototype.getBoundingClientRect;

    const line = { ...LINE_RECT, top: 400, bottom: 420 };
    const items: ContextMenuItem[] = [{ kind: 'action', label: 'Item', onSelect: vi.fn() }];
    act(() => {
      root.render(
        <ContextMenu
          items={items}
          x={0}
          y={0}
          onClose={vi.fn()}
          anchor={{ lineRect: line, prefer: 'above' }}
        />,
      );
    });

    expect(panel().style.bottom).not.toBe('');
    expect(panel().style.top).toBe('');

    // Grow the panel (as search results would) and re-render — the side must not flip.
    height = 350;
    act(() => {
      root.render(
        <ContextMenu
          items={items}
          x={0}
          y={0}
          onClose={vi.fn()}
          anchor={{ lineRect: line, prefer: 'above' }}
        />,
      );
    });

    expect(panel().style.bottom).not.toBe('');
    expect(panel().style.top).toBe('');
  });
});
