// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { TopBar } from '../top-bar';
import type { TrackTab } from '../../domain/tabs';

const TABS: TrackTab[] = [
  { trackId: 'rep', name: 'PF2E Reputation', kind: 'numeric', count: 33 },
  { trackId: 'att', name: 'Attitude', kind: 'ordinal', count: 118 },
  { trackId: 'tag', name: 'Relationship tags', kind: 'categorical', count: 96 },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(over: Partial<Parameters<typeof TopBar>[0]> = {}) {
  const onSelectTab = vi.fn();
  act(() =>
    root.render(
      <TopBar
        tabs={TABS}
        activeTrackId="att"
        onSelectTab={onSelectTab}
        asOfLabel="12 Lamashan 4725"
        problems={[]}
        entityIndex={[]}
        onOpenById={vi.fn()}
        onOpenEvent={vi.fn()}
        {...over}
      />,
    ),
  );
  return { onSelectTab };
}
const tabs = () => Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'));

describe('TopBar', () => {
  it('tabs render name and kind · count in order', () => {
    render();
    expect(tabs().map((t) => t.textContent)).toEqual([
      'PF2E Reputation numeric · 33',
      'Attitude ordinal · 118',
      'Relationship tags categorical · 96',
    ]);
    expect(container.querySelector('[role="tablist"]')).not.toBeNull();
  });

  it('the active tab is aria-selected and the only one with tabIndex 0', () => {
    render();
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('Right/Left move between tabs and wrap', () => {
    const { onSelectTab } = render({ activeTrackId: 'tag' });
    fireEvent.keyDown(tabs()[2], { key: 'ArrowRight' });
    expect(onSelectTab).toHaveBeenLastCalledWith('rep');
    expect(document.activeElement).toBe(tabs()[0]);
    fireEvent.keyDown(tabs()[0], { key: 'ArrowLeft' });
    expect(onSelectTab).toHaveBeenLastCalledWith('tag');
    expect(document.activeElement).toBe(tabs()[2]);
  });

  it('as of label shows the in-game date', () => {
    render();
    expect(container.textContent).toContain('as of 12 Lamashan 4725');
    render({ asOfLabel: null });
    expect(container.textContent).not.toContain('as of');
  });
});
