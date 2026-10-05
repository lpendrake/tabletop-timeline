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
});

describe('SearchablePicker pinned groups', () => {
  const PINNED: PickerOption[] = [
    { id: 'all', path: 'All holders', count: 33 },
    { id: 'v', path: 'The Vanguard', count: 15 },
  ];
  const ENTITIES: PickerOption[] = [
    { id: 'v', path: 'The Vanguard', count: 15 },
    { id: 'q', path: 'Quill', count: 2 },
  ];

  beforeEach(() => setup());
  afterEach(() => teardown());

  function renderPinned(extra: Partial<React.ComponentProps<typeof SearchablePicker>> = {}) {
    act(() => {
      root.render(
        <SearchablePicker
          options={ENTITIES}
          pinned={PINNED}
          highlightMatches
          onPick={() => {}}
          {...extra}
        />,
      );
    });
  }

  function highlighted(): string {
    return container.querySelector('.is-highlighted')!.getAttribute('data-index')!;
  }

  it('Up/Down skip group headers and wrap', () => {
    renderPinned();
    expect(container.querySelectorAll('.searchable-picker-group')).toHaveLength(2);
    expect(getRows()).toHaveLength(4);
    expect(highlighted()).toBe('0');
    for (const expected of ['1', '2', '3', '0']) {
      act(() => {
        fireEvent.keyDown(getInput(), { key: 'ArrowDown' });
      });
      expect(highlighted()).toBe(expected);
    }
    act(() => {
      fireEvent.keyDown(getInput(), { key: 'ArrowUp' });
    });
    expect(highlighted()).toBe('3');
  });

  it('matched text is wrapped in mark', () => {
    renderPinned();
    act(() => {
      fireEvent.change(getInput(), { target: { value: 'VAN' } });
    });
    const marks = Array.from(container.querySelectorAll('.searchable-picker-match'));
    expect(marks.map((m) => m.textContent)).toEqual(['Van', 'Van']);
  });

  it('does not highlight when highlightMatches is off', () => {
    renderPinned({ highlightMatches: false });
    act(() => {
      fireEvent.change(getInput(), { target: { value: 'van' } });
    });
    expect(container.querySelector('.searchable-picker-match')).toBeNull();
  });

  it('150 options: filtering and highlighted row scrolls into view', () => {
    const many: PickerOption[] = Array.from({ length: 150 }, (_, i) => ({
      id: `e${i}`,
      path: `Entity ${i}`,
      count: 150 - i,
    }));
    const spy = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
      spy(this.getAttribute('data-index'));
    };
    try {
      renderPinned({ options: many });
      expect(getRows()).toHaveLength(152);
      spy.mockClear();
      act(() => {
        fireEvent.keyDown(getInput(), { key: 'ArrowUp' });
      });
      expect(spy).toHaveBeenLastCalledWith('151');
      act(() => {
        fireEvent.change(getInput(), { target: { value: 'Entity 14' } });
      });
      // Entity 14 and 140..149 => 11 rows, no pinned matches
      expect(getRows()).toHaveLength(11);
      expect(container.querySelectorAll('.searchable-picker-group')).toHaveLength(1);
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it('count renders muted beside the label', () => {
    renderPinned();
    const row = getRows()[0];
    expect(row.querySelector('.searchable-picker-label')!.textContent).toBe('All holders');
    expect(row.querySelector('.searchable-picker-count')!.textContent).toBe('33');
  });

  it('without pinned the picker renders exactly as before', () => {
    act(() => {
      root.render(<SearchablePicker options={OPTIONS} onPick={() => {}} />);
    });
    expect(container.querySelector('.searchable-picker-group')).toBeNull();
    expect(container.querySelector('.searchable-picker-count')).toBeNull();
    expect(getRows().map((r) => r.textContent)).toEqual(OPTIONS.map((o) => o.path));
  });
});
