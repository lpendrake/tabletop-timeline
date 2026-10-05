// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { GroupHeader, type GroupHeaderProps } from '../group-header';
import type { ContextMenuItem } from '../../../shared/context-menu';
import type { ViewGroup, ViewRow } from '../../domain/view-rows';

const showContextMenu = vi.fn();
vi.mock('../../../shared/context-menu', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/context-menu')>();
  return {
    ...actual,
    showContextMenu: (...args: unknown[]) => showContextMenu(...args),
  };
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  showContextMenu.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function makeGroup(over: Partial<ViewGroup> = {}): ViewGroup {
  return {
    holderId: 'holder-1',
    label: 'Holder One',
    listKey: 'rp01:holder-1',
    collapsed: false,
    rows: [{}, {}, {}] as ViewRow[],
    ...over,
  };
}

function props(over: Partial<GroupHeaderProps> = {}): GroupHeaderProps {
  return {
    group: makeGroup(),
    groupsListKey: 'rp01:*',
    canDrag: true,
    moveRow: vi.fn(),
    isFirst: false,
    isLast: false,
    toggleGroup: vi.fn(),
    ...over,
  };
}

function render(p: GroupHeaderProps) {
  act(() => root.render(<GroupHeader {...p} />));
}

const header = () => container.querySelector<HTMLElement>('.rel-group-header')!;

describe('GroupHeader', () => {
  it('clicking the header toggles the group', () => {
    const p = props();
    render(p);
    act(() => {
      fireEvent.click(header());
    });
    expect(p.toggleGroup).toHaveBeenCalledWith('holder-1');
  });

  it('Enter and Space toggle; Enter on the drag handle does not', () => {
    const p = props();
    render(p);
    act(() => {
      fireEvent.keyDown(header(), { key: 'Enter' });
    });
    act(() => {
      fireEvent.keyDown(header(), { key: ' ' });
    });
    expect(p.toggleGroup).toHaveBeenCalledTimes(2);
    act(() => {
      fireEvent.keyDown(container.querySelector('.rel-drag-handle')!, { key: 'Enter' });
    });
    expect(p.toggleGroup).toHaveBeenCalledTimes(2);
  });

  it('no drag handle or move menu when canDrag is false', () => {
    render(props({ canDrag: false }));
    expect(container.querySelector('.rel-drag-handle')).toBeNull();
    act(() => {
      fireEvent.contextMenu(header());
    });
    expect(showContextMenu).not.toHaveBeenCalled();
  });

  it('move menu disables Move to top / Move up for the first group', () => {
    const p = props({ isFirst: true });
    render(p);
    act(() => {
      fireEvent.contextMenu(header());
    });
    expect(showContextMenu).toHaveBeenCalledTimes(1);
    const items = showContextMenu.mock.calls[0][0] as Extract<
      ContextMenuItem,
      { kind: 'action' }
    >[];
    expect(items.map((i) => [i.label, i.disabled])).toEqual([
      ['Move to top', true],
      ['Move up', true],
      ['Move down', false],
    ]);
    items[2].onSelect();
    expect(p.moveRow).toHaveBeenCalledWith('rp01:*', 'holder-1', 'down');
  });

  it('shows standing with N and aria-expanded follows collapsed', () => {
    render(props());
    expect(container.querySelector('.rel-group-count')!.textContent).toBe('standing with 3');
    expect(container.querySelector('.rel-group-name')!.textContent).toBe('Holder One');
    expect(header().getAttribute('aria-expanded')).toBe('true');
    render(props({ group: makeGroup({ collapsed: true }) }));
    expect(header().getAttribute('aria-expanded')).toBe('false');
  });
});
