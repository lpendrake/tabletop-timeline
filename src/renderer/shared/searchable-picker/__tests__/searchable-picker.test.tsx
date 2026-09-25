// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { SearchablePicker } from '../searchable-picker';
import type { PickerOption } from '../picker-model';

const OPTIONS: PickerOption[] = [
  { id: 'npcs', path: 'npcs' },
  { id: 'factions', path: 'factions' },
  { id: 'factions/house-of-storms', path: 'factions/the-house-of-storms' },
  { id: 'factions/house-of-storms/spies', path: 'factions/the-house-of-storms/spies' },
  { id: 'locations', path: 'locations' },
];

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

function getInput(): HTMLInputElement {
  return container.querySelector('input')!;
}

function getRows(): HTMLElement[] {
  return Array.from(container.querySelectorAll('.searchable-picker-row'));
}

describe('SearchablePicker', () => {
  beforeEach(() => {
    setup();
  });

  afterEach(() => {
    teardown();
  });

  it('typing filters and Enter picks the top match', () => {
    const onPick = vi.fn();
    act(() => {
      root.render(<SearchablePicker options={OPTIONS} onPick={onPick} />);
    });

    act(() => {
      fireEvent.change(getInput(), { target: { value: 'storm/spies' } });
    });

    expect(getRows()).toHaveLength(1);
    expect(getRows()[0].textContent).toBe('factions/the-house-of-storms/spies');

    act(() => {
      fireEvent.keyDown(getInput(), { key: 'Enter' });
    });

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'factions/house-of-storms/spies' }),
    );
  });

  it('Down/Up move the highlight', () => {
    const onPick = vi.fn();
    act(() => {
      root.render(<SearchablePicker options={OPTIONS} onPick={onPick} />);
    });

    expect(getRows()[0].className).toContain('is-highlighted');

    act(() => {
      fireEvent.keyDown(getInput(), { key: 'ArrowDown' });
    });
    expect(getRows()[1].className).toContain('is-highlighted');
    expect(getRows()[0].className).not.toContain('is-highlighted');

    act(() => {
      fireEvent.keyDown(getInput(), { key: 'ArrowUp' });
    });
    expect(getRows()[0].className).toContain('is-highlighted');

    act(() => {
      fireEvent.keyDown(getInput(), { key: 'Enter' });
    });
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: OPTIONS[0].id }));
  });

  it('Enter with no matches does nothing and shows empty text', () => {
    const onPick = vi.fn();
    act(() => {
      root.render(<SearchablePicker options={OPTIONS} onPick={onPick} emptyText="Nothing here" />);
    });

    act(() => {
      fireEvent.change(getInput(), { target: { value: 'zzzznotfound' } });
    });

    expect(container.querySelector('.searchable-picker-empty')?.textContent).toBe('Nothing here');

    act(() => {
      fireEvent.keyDown(getInput(), { key: 'Enter' });
    });
    expect(onPick).not.toHaveBeenCalled();
  });

  it('Escape calls onCancel and does not propagate', () => {
    const onPick = vi.fn();
    const onCancel = vi.fn();
    const documentKeydown = vi.fn();
    document.addEventListener('keydown', documentKeydown);

    act(() => {
      root.render(<SearchablePicker options={OPTIONS} onPick={onPick} onCancel={onCancel} />);
    });

    act(() => {
      fireEvent.keyDown(getInput(), { key: 'Escape', bubbles: true, cancelable: true });
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(documentKeydown).not.toHaveBeenCalled();

    document.removeEventListener('keydown', documentKeydown);
  });

  it('mousedown on an option picks it', () => {
    const onPick = vi.fn();
    act(() => {
      root.render(<SearchablePicker options={OPTIONS} onPick={onPick} />);
    });

    act(() => {
      fireEvent.mouseDown(getRows()[2]);
    });

    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'factions/house-of-storms' }),
    );
  });

  it('value highlights the current option when query is empty', () => {
    const onPick = vi.fn();
    act(() => {
      root.render(<SearchablePicker options={OPTIONS} onPick={onPick} value="locations" />);
    });

    const rows = getRows();
    const highlightedIndex = rows.findIndex((r) => r.className.includes('is-highlighted'));
    expect(rows[highlightedIndex].textContent).toBe('locations');
  });

  it('ArrowDown/Up move freely when a value is highlighted — no snap-back mid-navigation', () => {
    const onPick = vi.fn();
    act(() => {
      root.render(<SearchablePicker options={OPTIONS} onPick={onPick} value="locations" />);
    });

    // Starts highlighted on the current value's row (index 4), not the top row.
    expect(getRows()[4].className).toContain('is-highlighted');

    act(() => {
      fireEvent.keyDown(getInput(), { key: 'ArrowUp' });
    });
    // Moves off the value's row and STAYS there — a re-render alone (from
    // the highlight-state change) must not recompute `results` and snap
    // the highlight back to the value's row.
    expect(getRows()[3].className).toContain('is-highlighted');
    expect(getRows()[4].className).not.toContain('is-highlighted');

    act(() => {
      fireEvent.keyDown(getInput(), { key: 'ArrowUp' });
    });
    expect(getRows()[2].className).toContain('is-highlighted');
  });

  it('a create row is reachable by keyboard: wraps into it, Enter picks it', () => {
    const onPick = vi.fn();
    const onCreatePick = vi.fn();
    act(() => {
      root.render(
        <SearchablePicker
          options={OPTIONS}
          onPick={onPick}
          createRow={{ show: true, render: () => 'Create "new"', onPick: onCreatePick }}
        />,
      );
    });

    // ArrowUp from the first row wraps backwards straight into the create
    // row, past the end of the ranked results.
    act(() => {
      fireEvent.keyDown(getInput(), { key: 'ArrowUp' });
    });
    const createRow = container.querySelector('.searchable-picker-create-row')!;
    expect(createRow.className).toContain('is-highlighted');

    act(() => {
      fireEvent.keyDown(getInput(), { key: 'Enter' });
    });
    expect(onCreatePick).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('a create row is reachable by mouse and reports the typed query via onQueryChange', () => {
    const onPick = vi.fn();
    const onCreatePick = vi.fn();
    const onQueryChange = vi.fn();
    act(() => {
      root.render(
        <SearchablePicker
          options={OPTIONS}
          onPick={onPick}
          onQueryChange={onQueryChange}
          createRow={{ show: true, render: () => 'Create "zz"', onPick: onCreatePick }}
        />,
      );
    });

    act(() => {
      fireEvent.change(getInput(), { target: { value: 'zz' } });
    });
    expect(onQueryChange).toHaveBeenCalledWith('zz');

    const createRow = container.querySelector('.searchable-picker-create-row')!;
    act(() => {
      fireEvent.mouseDown(createRow);
    });
    expect(onCreatePick).toHaveBeenCalledTimes(1);
  });
});
