// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { COLUMN_LIMITS, DEFAULT_COLUMN_WIDTHS } from '../../domain/column-widths';
import { loadColumnWidths, saveColumnWidths } from '../../view-state-persistence';
import { useColumnWidths, type ColumnWidthsState } from '../use-column-widths';

let container: HTMLDivElement;
let root: Root;
let latest: ColumnWidthsState;

function Host({ campaignPath }: { campaignPath: string }) {
  latest = useColumnWidths(campaignPath);
  return null;
}

function mount(campaignPath: string) {
  act(() => root.render(<Host campaignPath={campaignPath} />));
}

const SAVE_DELAY_MS = 300;

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('use-column-widths', () => {
  it('loads, resizes, resets and saves per campaign', () => {
    saveColumnWidths('/c2', { ...DEFAULT_COLUMN_WIDTHS, name: 400 });
    mount('/c1');
    expect(latest.widths).toEqual(DEFAULT_COLUMN_WIDTHS);

    act(() => latest.setColumnWidth('name', 250.4));
    expect(latest.widths.name).toBe(250);
    advance(SAVE_DELAY_MS);
    expect(loadColumnWidths('/c1').name).toBe(250);

    act(() => latest.setColumnWidth('value', 9999));
    expect(latest.widths.value).toBe(COLUMN_LIMITS.value.max);
    advance(SAVE_DELAY_MS);
    expect(loadColumnWidths('/c1').value).toBe(COLUMN_LIMITS.value.max);

    mount('/c2');
    expect(latest.widths.name).toBe(400);
    expect(latest.widths.value).toBe(DEFAULT_COLUMN_WIDTHS.value);

    mount('/c1');
    expect(latest.widths.name).toBe(250);

    act(() => latest.resetColumnWidth('name'));
    expect(latest.widths.name).toBe(DEFAULT_COLUMN_WIDTHS.name);
    advance(SAVE_DELAY_MS);
    expect(loadColumnWidths('/c1').name).toBe(DEFAULT_COLUMN_WIDTHS.name);
    expect(loadColumnWidths('/c2').name).toBe(400);
  });

  it('does not write storage when the width is unchanged', () => {
    mount('/c1');
    act(() => latest.setColumnWidth('name', DEFAULT_COLUMN_WIDTHS.name));
    advance(SAVE_DELAY_MS);
    expect(localStorage.getItem('relationships-view:/c1')).toBeNull();
  });

  it('a captured setter applies each call to the latest widths', () => {
    mount('/c1');
    const { setColumnWidth } = latest;
    act(() => setColumnWidth('name', 300));
    act(() => setColumnWidth('name', 180));
    expect(latest.widths.name).toBe(180);
    advance(SAVE_DELAY_MS);
    expect(loadColumnWidths('/c1').name).toBe(180);
  });

  it('several columns set in one batch all apply', () => {
    mount('/c1');
    act(() => {
      latest.setColumnWidth('name', 300);
      latest.setColumnWidth('value', 90);
    });
    expect(latest.widths.name).toBe(300);
    expect(latest.widths.value).toBe(90);
    advance(SAVE_DELAY_MS);
    expect(loadColumnWidths('/c1')).toEqual({ ...DEFAULT_COLUMN_WIDTHS, name: 300, value: 90 });
  });

  it('ignores a non-finite width', () => {
    mount('/c1');
    act(() => latest.setColumnWidth('name', NaN));
    expect(latest.widths).toEqual(DEFAULT_COLUMN_WIDTHS);
    advance(SAVE_DELAY_MS);
    expect(localStorage.getItem('relationships-view:/c1')).toBeNull();
  });

  it('keeps the setters stable while the campaign is unchanged', () => {
    mount('/c1');
    const { setColumnWidth, resetColumnWidth } = latest;
    act(() => latest.setColumnWidth('name', 300));
    expect(latest.setColumnWidth).toBe(setColumnWidth);
    expect(latest.resetColumnWidth).toBe(resetColumnWidth);
  });

  it('debounces storage writes to one with the final widths', () => {
    mount('/c1');
    const setItem = vi.spyOn(localStorage, 'setItem');
    for (const width of [200, 220, 240, 260]) {
      act(() => latest.setColumnWidth('name', width));
      advance(SAVE_DELAY_MS - 100);
    }
    expect(setItem).not.toHaveBeenCalled();
    advance(100);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(loadColumnWidths('/c1').name).toBe(260);
    setItem.mockRestore();
  });

  it('flushes a pending write to the old campaign when the campaign changes', () => {
    mount('/c1');
    act(() => latest.setColumnWidth('name', 321));
    expect(localStorage.getItem('relationships-view:/c1')).toBeNull();

    mount('/c2');
    expect(loadColumnWidths('/c1').name).toBe(321);
    expect(latest.widths).toEqual(DEFAULT_COLUMN_WIDTHS);
    advance(SAVE_DELAY_MS);
    expect(localStorage.getItem('relationships-view:/c2')).toBeNull();
  });

  it('flushes a pending write on unmount', () => {
    mount('/c1');
    act(() => latest.setColumnWidth('name', 333));
    expect(localStorage.getItem('relationships-view:/c1')).toBeNull();
    act(() => root.unmount());
    expect(loadColumnWidths('/c1').name).toBe(333);
    root = createRoot(container);
  });
});
