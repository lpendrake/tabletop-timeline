// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { HolderPicker } from '../holder-picker';
import { SearchBox } from '../search-box';
import { SortControl } from '../sort-control';
import type { HolderPickerModel } from '../../domain/view-state';

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

function render(ui: React.ReactElement) {
  act(() => root.render(ui));
}

function makePicker(n = 3): HolderPickerModel {
  const holders = Array.from({ length: n }, (_, i) => ({ id: `e${i}`, count: n - i }));
  return {
    show: true,
    label: 'Holder',
    allLabel: 'All holders',
    holders,
    pinned: [
      { id: '*', count: 33 },
      { id: 'e1', count: n - 1 },
    ],
    selectedId: 'e1',
    selectedCount: n - 1,
  };
}

const labelFor = (id: string) => (id === 'e1' ? 'The Vanguard' : `Entity ${id}`);

function button(): HTMLButtonElement {
  return container.querySelector('.rel-holder-button')!;
}

function openDropdown() {
  act(() => {
    fireEvent.click(button());
  });
}

describe('HolderPicker', () => {
  it('holder button shows label, bold holder name and muted count', () => {
    render(<HolderPicker picker={makePicker()} labelFor={labelFor} onSelect={vi.fn()} />);
    expect(container.querySelector('.rel-holder-caption')!.textContent).toBe('Holder');
    const name = container.querySelector('.rel-holder-name')!;
    expect(name.tagName).toBe('STRONG');
    expect(name.textContent).toBe('The Vanguard');
    expect(container.querySelector('.rel-holder-count')!.textContent).toBe('2');
  });

  it('is hidden when show is false', () => {
    render(
      <HolderPicker
        picker={{ ...makePicker(), show: false }}
        labelFor={labelFor}
        onSelect={vi.fn()}
      />,
    );
    expect(container.querySelector('.rel-holder-picker')).toBeNull();
  });

  it('holder dropdown shows Pinned then All and picking closes it', () => {
    const onSelect = vi.fn();
    render(<HolderPicker picker={makePicker()} labelFor={labelFor} onSelect={onSelect} />);
    openDropdown();
    const headers = Array.from(container.querySelectorAll('.searchable-picker-group')).map(
      (h) => h.textContent,
    );
    expect(headers).toEqual(['Pinned', 'All']);
    expect(container.querySelector('input')!.getAttribute('placeholder')).toBe(
      'Search 3 entities…',
    );
    const rows = Array.from(container.querySelectorAll<HTMLElement>('.searchable-picker-row'));
    expect(rows[0].textContent).toContain('All holders');
    act(() => {
      fireEvent.mouseDown(rows[0]);
    });
    expect(onSelect).toHaveBeenCalledWith('*');
    expect(container.querySelector('.rel-holder-dropdown')).toBeNull();
  });

  it('holder dropdown handles 120 entities and filters with highlighted text', () => {
    render(<HolderPicker picker={makePicker(120)} labelFor={labelFor} onSelect={vi.fn()} />);
    openDropdown();
    // 2 pinned + 120 in All
    expect(container.querySelectorAll('.searchable-picker-row')).toHaveLength(122);
    const input = container.querySelector('input')!;
    act(() => {
      fireEvent.change(input, { target: { value: 'entity e11' } });
    });
    const marks = container.querySelectorAll('mark.searchable-picker-match');
    expect(marks.length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.searchable-picker-row').length).toBeLessThan(122);
  });

  it('Escape closes the holder dropdown and focuses the button', () => {
    render(<HolderPicker picker={makePicker()} labelFor={labelFor} onSelect={vi.fn()} />);
    openDropdown();
    act(() => {
      fireEvent.keyDown(container.querySelector('input')!, { key: 'Escape' });
    });
    expect(container.querySelector('.rel-holder-dropdown')).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it('closes on outside click', () => {
    render(<HolderPicker picker={makePicker()} labelFor={labelFor} onSelect={vi.fn()} />);
    openDropdown();
    act(() => {
      fireEvent.mouseDown(document.body);
    });
    expect(container.querySelector('.rel-holder-dropdown')).toBeNull();
  });
});

describe('SearchBox', () => {
  const scopes = [
    { scope: 'name' as const, label: 'Name', enabled: true },
    { scope: 'band' as const, label: 'Band', enabled: false },
  ];

  it('search shows N of M and × clears the query', () => {
    const onQueryChange = vi.fn();
    render(
      <SearchBox
        query="van"
        onQueryChange={onQueryChange}
        countLabel="3 of 15"
        scopes={scopes}
        onToggleScope={vi.fn()}
      />,
    );
    expect(container.querySelector('.rel-search-count')!.textContent).toBe('3 of 15');
    act(() => {
      fireEvent.click(container.querySelector('.rel-search-clear')!);
    });
    expect(onQueryChange).toHaveBeenCalledWith('');
  });

  it('hides count and clear without a query', () => {
    render(
      <SearchBox
        query=""
        onQueryChange={vi.fn()}
        countLabel={null}
        scopes={scopes}
        onToggleScope={vi.fn()}
      />,
    );
    expect(container.querySelector('.rel-search-clear')).toBeNull();
    expect(container.querySelector('.rel-search-count')).toBeNull();
  });

  it('scope toggles reflect enabled state and call toggleScope', () => {
    const onToggleScope = vi.fn();
    render(
      <SearchBox
        query=""
        onQueryChange={vi.fn()}
        countLabel={null}
        scopes={scopes}
        onToggleScope={onToggleScope}
      />,
    );
    const chips = Array.from(container.querySelectorAll<HTMLButtonElement>('.rel-scope'));
    expect(chips.map((c) => c.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    act(() => {
      fireEvent.click(chips[1]);
    });
    expect(onToggleScope).toHaveBeenCalledWith('band');
  });
});

describe('SortControl', () => {
  it('sort control marks the active mode', () => {
    const onChange = vi.fn();
    render(
      <SortControl
        modes={[
          { mode: 'mine', label: 'My order' },
          { mode: 'value', label: 'By value' },
          { mode: 'recent', label: 'Recently changed' },
        ]}
        active="value"
        onChange={onChange}
      />,
    );
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    act(() => {
      fireEvent.click(buttons[2]);
    });
    expect(onChange).toHaveBeenCalledWith('recent');
  });

  it('no sort control when the track offers no modes', () => {
    render(<SortControl modes={[]} active="mine" onChange={vi.fn()} />);
    expect(container.querySelector('.rel-sort')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });
});
