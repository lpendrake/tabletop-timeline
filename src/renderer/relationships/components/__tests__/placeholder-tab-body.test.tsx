// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import { PlaceholderTabBody, type PlaceholderTabBodyProps } from '../placeholder-tab-body';
import type { HistoryEntry, ViewGroup, ViewRow } from '../../domain/view-rows';
import type { RelationshipDelta } from '../../../../shared/relationships';

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

function entry(key: string, hit: boolean | null, title: string): HistoryEntry {
  return {
    key,
    at: 1,
    dateLabel: '1 Abadius 4725',
    delta: {
      op: 'adjust',
      by: 2,
      at: 1,
      declaredIn: { path: 'timeline/battle.md', ordinal: 0 },
    } as RelationshipDelta,
    runningValue: 2,
    runningFormatted: '2',
    applied: true,
    mirrored: false,
    eventTitle: title,
    reason: null,
    hit,
  };
}

function makeRow(observerId: string, history: HistoryEntry[] | null = null): ViewRow {
  return {
    key: `k-${observerId}`,
    listKey: 'rp01:h',
    holderId: 'h',
    observerId,
    label: `Name ${observerId}`,
    value: 2,
    formatted: '2',
    stateLabel: 'Friendly',
    colour: 'var(--theme-accent-gold)',
    lastChange: {
      delta: { op: 'adjust', by: 2 } as RelationshipDelta,
      at: 1,
      dateLabel: '23 Gozran 4725',
    },
    entryCount: 3,
    onlyFuture: false,
    expanded: history !== null,
    history,
  } as unknown as ViewRow;
}

function group(rows: ViewRow[]): ViewGroup {
  return { holderId: 'h', label: 'Holder', listKey: 'rp01:h', collapsed: false, rows };
}

function props(over: Partial<PlaceholderTabBodyProps> = {}): PlaceholderTabBodyProps {
  return {
    groups: [group([makeRow('a'), makeRow('b')])],
    groupsListKey: 'rp01:*',
    canDrag: true,
    query: '',
    emptyMessage: null,
    emptyStateTrackName: 'Reputation',
    trackProblems: [],
    toggleRow: vi.fn(),
    toggleGroup: vi.fn(),
    moveRow: vi.fn(),
    onOpenById: vi.fn(),
    onOpenEvent: vi.fn(),
    entityIndex: [],
    ...over,
  };
}

function render(p: PlaceholderTabBodyProps) {
  act(() => root.render(<PlaceholderTabBody {...p} />));
}

describe('PlaceholderTabBody', () => {
  it('drag handles only render when canDrag', () => {
    render(props({ canDrag: true }));
    expect(container.querySelectorAll('.rel-drag-handle')).toHaveLength(2);
    render(props({ canDrag: false }));
    expect(container.querySelectorAll('.rel-drag-handle')).toHaveLength(0);
  });

  it('Enter and Space toggle a row; clicking the name opens the note without toggling', () => {
    const p = props();
    render(p);
    const row = container.querySelector<HTMLElement>('.rel-row')!;
    expect(row.tabIndex).toBe(0);
    act(() => {
      fireEvent.keyDown(row, { key: 'Enter' });
    });
    act(() => {
      fireEvent.keyDown(row, { key: ' ' });
    });
    expect(p.toggleRow).toHaveBeenCalledTimes(2);
    expect(p.toggleRow).toHaveBeenCalledWith('rp01:h', 'a');
    act(() => {
      fireEvent.click(container.querySelector('.rel-entity-link')!);
    });
    expect(p.onOpenById).toHaveBeenCalledWith('a');
    expect(p.toggleRow).toHaveBeenCalledTimes(2);
  });

  it('history hit entries are tinted and others dimmed; matched text is marked', () => {
    render(
      props({
        query: 'siege',
        groups: [
          group([makeRow('a', [entry('1', true, 'Siege of Ash'), entry('2', false, 'Parade')])]),
        ],
      }),
    );
    const items = container.querySelectorAll('.rel-entry');
    expect(items[0].classList.contains('is-hit')).toBe(true);
    expect(items[1].classList.contains('is-dim')).toBe(true);
    const mark = items[0].querySelector('mark.rel-match')!;
    expect(mark.textContent).toBe('Siege');
    expect(items[1].querySelector('mark')).toBeNull();
  });

  it('opens the declaring event from a history entry title', () => {
    const p = props({ groups: [group([makeRow('a', [entry('1', null, 'Siege of Ash')])])] });
    render(p);
    act(() => {
      fireEvent.click(container.querySelector('.rel-entry-event')!);
    });
    expect(p.onOpenEvent).toHaveBeenCalledWith('battle.md');
  });

  it("empty track shows the '/' empty state; empty search shows emptyMessage", () => {
    render(props({ groups: [group([])] }));
    expect(container.querySelector('.rel-empty')!.textContent).toBe(
      'No Reputation changes yet. Type / in an event or note and choose Relationships › Reputation.',
    );
    expect(container.querySelector('.rel-empty code')!.textContent).toBe('/');
    render(props({ groups: [], query: 'zzz', emptyMessage: 'Nothing matches "zzz"' }));
    expect(container.querySelector('.rel-empty')!.textContent).toBe('Nothing matches "zzz"');
  });

  it('shows track problems at the bottom', () => {
    render(
      props({
        trackProblems: [{ path: 'notes/x.md', from: 0, to: 1, messages: ['Bad op'] }],
      }),
    );
    expect(container.querySelector('.rel-problems-title')!.textContent).toBe(
      'Problems in this track',
    );
    expect(container.querySelector('.rel-problems')!.textContent).toContain('notes/x.md');
  });
});
