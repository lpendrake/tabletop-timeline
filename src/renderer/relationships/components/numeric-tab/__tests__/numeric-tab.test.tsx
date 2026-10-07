// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import type {
  InvalidDirectiveEntry,
  Ledger,
  NumericTrack,
  RelationshipDelta,
} from '../../../../../shared/relationships';
import { computeTooltipPosition } from '../../../../shared/tooltip-position';
import {
  columnTemplate,
  COLUMN_LIMITS,
  DEFAULT_COLUMN_WIDTHS,
  KEY_RESIZE_STEP,
} from '../../../domain/numeric-columns';
import { formatEntryDate } from '../../../domain/entry-date';
import { numericTabModel } from '../../../domain/numeric-rows';
import { percent } from '../../../domain/plot-scale';
import { formatNumber } from '../../../domain/row-display';
import { defaultViewOrder, rowListKey, groupListKey } from '../../../domain/view-order';
import type { ViewOrder } from '../../../domain/view-order';
import { deriveViewRows, type ViewRowsResult } from '../../../domain/view-rows';
import { noBands, pf2e, tenBands, unbounded } from '../../../domain/__tests__/numeric-fixtures';
import { TOOLTIP_MAX_WIDTH } from '../../../hooks/use-plot-tooltip';
import { NumericTab, type NumericTabProps } from '../numeric-tab';

const showContextMenu = vi.hoisted(() => vi.fn());

vi.mock('../../../../peek/stack', () => ({
  openFromWikiLink: vi.fn(),
  closeFromWikiLink: vi.fn(),
}));

vi.mock('../../../../shared/context-menu', () => ({ showContextMenu }));

// ---- Fixtures ----
//
// Holders: aaaa Zara, dddd Kel. Observers: bbbb Anna, cccc Mira.

const T = 4725 * 31_536_000;
const NOW = T + 1000;
const AS_OF = '12 Lamashan 4725';
const LABELS: Record<string, string> = { aaaa: 'Zara', bbbb: 'Anna', cccc: 'Mira', dddd: 'Kel' };

function delta(partial: Partial<RelationshipDelta> & Pick<RelationshipDelta, 'op'>) {
  return {
    at: null,
    declaredIn: { path: 'notes/a.md', ordinal: 0 },
    ...partial,
  } as RelationshipDelta;
}

function ledger(
  holder: string,
  observer: string,
  track: NumericTrack,
  deltas: RelationshipDelta[],
): Ledger {
  return { holder, observer, track: track.id, deltas };
}

/** Zara→Anna +18 (dated), Zara→Mira −16, Kel→Anna +10. */
function pf2eLedgers(): Ledger[] {
  return [
    ledger('aaaa', 'bbbb', pf2e, [delta({ op: 'adjust', by: 18, at: T + 10 })]),
    ledger('aaaa', 'cccc', pf2e, [delta({ op: 'adjust', by: -16 })]),
    ledger('dddd', 'bbbb', pf2e, [delta({ op: 'adjust', by: 10, at: T + 30 })]),
  ];
}

function derive(
  track: NumericTrack,
  ledgers: Ledger[],
  holderId: string,
  viewOrder: ViewOrder = defaultViewOrder(),
): ViewRowsResult {
  return deriveViewRows({
    ledgers,
    track,
    trackId: track.id,
    holderId,
    now: NOW,
    titleByPath: new Map(),
    labelFor: (id) => LABELS[id] ?? id,
    query: '',
    enabledScopes: ['name', 'band'],
    sortMode: 'mine',
    viewOrder,
  });
}

function invalidEntry(): InvalidDirectiveEntry {
  return {
    path: 'notes/bad.md',
    trackId: 'rp01',
    ordinal: 0,
    from: 0,
    to: 5,
    messages: ['Bad amount'],
  };
}

function props(
  track: NumericTrack,
  result: ViewRowsResult,
  over: Partial<NumericTabProps> = {},
): NumericTabProps {
  return {
    track,
    toolbar: <div data-testid="toolbar">toolbar</div>,
    groups: result.groups,
    groupsListKey: groupListKey(track.id),
    grouped: result.grouped,
    canDrag: result.canDrag,
    query: '',
    emptyMessage: null,
    asOfLabel: AS_OF,
    trackProblems: [],
    widths: DEFAULT_COLUMN_WIDTHS,
    setColumnWidth: vi.fn(),
    resetColumnWidth: vi.fn(),
    sortMode: 'mine',
    sortByColumn: vi.fn(),
    toggleRow: vi.fn(),
    toggleGroup: vi.fn(),
    moveRow: vi.fn(),
    onOpenById: vi.fn(),
    ...over,
  };
}

/** The default PF2E tab: Zara's rows (Anna +18, Mira −16). */
function pf2eProps(over: Partial<NumericTabProps> = {}, viewOrder?: ViewOrder): NumericTabProps {
  return props(pf2e, derive(pf2e, pf2eLedgers(), 'aaaa', viewOrder), over);
}

// ---- Harness ----

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  showContextMenu.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(p: NumericTabProps) {
  act(() => root.render(<NumericTab {...p} />));
}

const $ = (sel: string, scope: ParentNode = container) => scope.querySelector<HTMLElement>(sel)!;
const $$ = (sel: string, scope: ParentNode = container) =>
  Array.from(scope.querySelectorAll<HTMLElement>(sel));
const text = (els: HTMLElement[]) => els.map((e) => e.textContent);
const headerLabels = () => text($$('.rel-num-columns .rel-num-title-label'));
const header = (title: string) =>
  $$('.rel-num-th').find((th) => $('.rel-num-title-label', th).textContent === title)!;
const gripOf = (title: string) => $('.rel-num-grip', header(title));

function rowFor(name: string): HTMLElement {
  const row = $$('.rel-num-row').find((r) => $('.rel-num-name', r).textContent === name);
  if (!row) throw new Error(`no row ${name}`);
  return row;
}

function ledgerRow(track: NumericTrack, value: number, observer = 'bbbb'): Ledger {
  return ledger('aaaa', observer, track, [delta({ op: 'set', value })]);
}

describe('NumericTab', () => {
  it('sticky header holds the toolbar slot and the column titles', () => {
    render(pf2eProps());
    const stickyHeader = $('.rel-num-header');
    expect($('[data-testid="toolbar"]', stickyHeader)).not.toBeNull();
    expect(stickyHeader.contains($('.rel-num-columns'))).toBe(true);
  });

  it('labels every PF2E band over its span in its colour', () => {
    const p = pf2eProps();
    render(p);
    const { scale } = numericTabModel(pf2e, p.groups, AS_OF);
    const labels = $$('.rel-num-axis-band');
    expect(labels).toHaveLength(7);
    expect(scale.bands).toHaveLength(7);
    labels.forEach((label, i) => {
      const span = scale.bands[i];
      expect(label.textContent).toBe(span.label);
      expect(label.title).toBe(span.label);
      expect(label.style.getPropertyValue('--rel-num-colour')).toBe(span.colour);
      expect(label.style.left).toBe(percent(span.start));
      expect(label.style.width).toBe(percent(span.end - span.start));
    });
  });

  it('a PF2E row shows value, band, signed change, date and entry count', () => {
    render(pf2eProps());
    const row = rowFor('Anna');
    expect($('.rel-num-value', row).textContent).toBe('18');
    expect($('.rel-num-band-label', row).textContent).toBe('Admired');
    const amount = $('.rel-num-amount', row);
    expect(amount.textContent).toBe('+18');
    expect(amount.classList.contains('is-positive')).toBe(true);
    expect($('.rel-num-date', row).textContent).toBe(formatEntryDate(T + 10));
    expect($('.rel-num-count', row).textContent).toBe('1');

    expect($('.rel-num-band-label', row).title).toBe('Admired');
    expect($('.rel-num-value', row).title).toBe('18');
    expect($('.rel-num-last', row).title).toBe(`+18 ${formatEntryDate(T + 10)}`);

    const mira = rowFor('Mira');
    expect($('.rel-num-amount', mira).classList.contains('is-negative')).toBe(true);
    expect($('.rel-num-value', mira).textContent).toBe(formatNumber(-16));
  });

  it('a banded row carries its band colour, which differs between bands', () => {
    const p = pf2eProps();
    render(p);
    const { rows } = numericTabModel(pf2e, p.groups, AS_OF);
    const colourOf = (name: string) => rowFor(name).style.getPropertyValue('--rel-num-colour');
    const [anna, mira] = p.groups[0].rows.map((r) => rows.get(r.key)!);
    expect(anna.bandLabel).toBe('Admired');
    expect(mira.bandLabel).toBe('Hated');
    expect(colourOf('Anna')).toBe(anna.colour);
    expect(colourOf('Mira')).toBe(mira.colour);
    expect(colourOf('Anna')).not.toBe('');
    expect(colourOf('Anna')).not.toBe(colourOf('Mira'));
  });

  it('a set shows a neutral last change', () => {
    render(props(pf2e, derive(pf2e, [ledgerRow(pf2e, 12)], 'aaaa')));
    const amount = $('.rel-num-amount', rowFor('Anna'));
    expect(amount.textContent).toBe('= 12');
    expect(amount.classList.contains('is-neutral')).toBe(true);
    expect(amount.classList.contains('is-positive')).toBe(false);
    expect(amount.classList.contains('is-negative')).toBe(false);
  });

  it('the plot draws the zero line, bands, initial→current line and dot', () => {
    render(pf2eProps());
    const plot = $('.rel-num-plot', rowFor('Anna'));
    expect($('.rel-num-zero', plot).style.left).toBe('50%');
    expect($$('.rel-num-band', plot)).toHaveLength(7);
    const line = $('.rel-num-line', plot);
    expect(line.style.left).toBe('50%');
    expect(line.style.width).toBe('18%');
    expect($('.rel-num-dot-hit', plot).style.left).toBe('68%');
  });

  it('hovering the line shows its tooltip above the pointer, and leaving hides it', () => {
    render(pf2eProps());
    const line = $('.rel-num-line', rowFor('Anna'));
    expect($('.rel-num-tooltip', document.body)).toBeNull();
    act(() => {
      fireEvent.mouseMove(line, { clientX: 100, clientY: 200 });
    });
    const tip = $('.rel-num-tooltip', document.body);
    expect(tip.textContent).toBe('18 · Admired (+18 from 0)');
    const at = computeTooltipPosition(
      { left: 100, top: 200 },
      window.innerWidth,
      window.innerHeight,
      TOOLTIP_MAX_WIDTH,
    );
    expect(at).toEqual({ left: 100, bottom: window.innerHeight - 200 + 6 });
    expect(tip.style.left).toBe('100px');
    expect(tip.style.right).toBe('');
    expect(tip.style.bottom).toBe(`${at.bottom}px`);
    expect(tip.style.maxWidth).toBe(`${TOOLTIP_MAX_WIDTH}px`);
    act(() => {
      fireEvent.mouseLeave(line);
    });
    expect($('.rel-num-tooltip', document.body)).toBeNull();
  });

  it('hovering near the right edge anchors the tooltip right edge at the pointer', () => {
    render(pf2eProps());
    const x = window.innerWidth - 20;
    act(() => {
      fireEvent.mouseMove($('.rel-num-line', rowFor('Anna')), { clientX: x, clientY: 200 });
    });
    const tip = $('.rel-num-tooltip', document.body);
    expect(tip.style.right).toBe('20px');
    expect(tip.style.left).toBe('');
  });

  it('the tooltip text follows the data while the line stays hovered', () => {
    render(pf2eProps());
    act(() => {
      fireEvent.mouseMove($('.rel-num-line', rowFor('Anna')), { clientX: 100, clientY: 200 });
    });
    expect($('.rel-num-tooltip', document.body).textContent).toBe('18 · Admired (+18 from 0)');
    const changed = ledger('aaaa', 'bbbb', pf2e, [delta({ op: 'adjust', by: -20, at: T + 10 })]);
    render(props(pf2e, derive(pf2e, [changed], 'aaaa')));
    expect($('.rel-num-tooltip', document.body).textContent).toBe(
      `${formatNumber(-20)} · Hated (${formatNumber(-20)} from 0)`,
    );
  });

  it('the tooltip goes when its row unmounts mid-hover', () => {
    const all = derive(pf2e, pf2eLedgers(), '*');
    render(props(pf2e, all));
    act(() => {
      fireEvent.mouseMove($('.rel-num-line', rowFor('Anna')), {
        clientX: 100,
        clientY: 200,
      });
    });
    expect($('.rel-num-tooltip', document.body)).not.toBeNull();
    const collapsed: ViewOrder = {
      ...defaultViewOrder(),
      collapsed: { [groupListKey(pf2e.id)]: ['aaaa', 'dddd'] },
    };
    render(props(pf2e, derive(pf2e, pf2eLedgers(), '*', collapsed)));
    expect($$('.rel-num-row')).toHaveLength(0);
    expect($('.rel-num-tooltip', document.body)).toBeNull();
  });

  it('hovering the dot shows the as-of tooltip', () => {
    render(pf2eProps());
    act(() => {
      fireEvent.mouseMove($('.rel-num-dot-hit', rowFor('Anna')), { clientX: 50, clientY: 60 });
    });
    expect($('.rel-num-tooltip', document.body).textContent).toBe(`18 · Admired as of ${AS_OF}`);
  });

  it('clicking a row toggles it; clicking the name opens the note without toggling', () => {
    const p = pf2eProps();
    render(p);
    act(() => {
      fireEvent.click(rowFor('Anna'));
    });
    expect(p.toggleRow).toHaveBeenCalledWith(rowListKey(pf2e.id, 'aaaa'), 'bbbb');
    expect(p.toggleRow).toHaveBeenCalledTimes(1);
    act(() => {
      fireEvent.click($('.rel-num-name', rowFor('Anna')));
    });
    expect(p.onOpenById).toHaveBeenCalledWith('bbbb');
    expect(p.toggleRow).toHaveBeenCalledTimes(1);
  });

  it('rows are focusable and Enter/Space expand; Enter on a child does not', () => {
    const p = pf2eProps();
    render(p);
    const row = rowFor('Anna');
    expect(row.tabIndex).toBe(0);
    expect(row.getAttribute('aria-expanded')).toBe('false');
    act(() => {
      fireEvent.keyDown(row, { key: 'Enter' });
    });
    act(() => {
      fireEvent.keyDown(row, { key: ' ' });
    });
    expect(p.toggleRow).toHaveBeenCalledTimes(2);
    act(() => {
      fireEvent.keyDown($('.rel-num-name', row), { key: 'Enter' });
    });
    expect(p.toggleRow).toHaveBeenCalledTimes(2);
  });

  it('an expanded row shows the history placeholder, not the history list', () => {
    const viewOrder: ViewOrder = {
      ...defaultViewOrder(),
      expanded: { [rowListKey(pf2e.id, 'aaaa')]: ['bbbb'] },
    };
    render(pf2eProps({}, viewOrder));
    expect(rowFor('Anna').getAttribute('aria-expanded')).toBe('true');
    expect($$('.rel-num-expanded')).toHaveLength(1);
    expect($$('.rel-entry')).toHaveLength(0);
  });

  it('All holders shows group headers that collapse; a single holder shows none', () => {
    const all = derive(pf2e, pf2eLedgers(), '*');
    const p = props(pf2e, all);
    render(p);
    const headers = $$('.rel-group-header');
    expect(text(headers.map((h) => $('.rel-group-name', h)))).toEqual(['Kel', 'Zara']);
    expect(text(headers.map((h) => $('.rel-group-count', h)))).toEqual([
      'standing with 1',
      'standing with 2',
    ]);
    expect($$('.rel-num-row')).toHaveLength(3);
    act(() => {
      fireEvent.click(headers[0]);
    });
    expect(p.toggleGroup).toHaveBeenCalledWith('dddd');

    const collapsed: ViewOrder = {
      ...defaultViewOrder(),
      collapsed: { [groupListKey(pf2e.id)]: ['aaaa'] },
    };
    render(props(pf2e, derive(pf2e, pf2eLedgers(), '*', collapsed)));
    expect($$('.rel-group-header')).toHaveLength(2);
    expect($$('.rel-num-row')).toHaveLength(1);

    render(pf2eProps());
    expect($$('.rel-group-header')).toHaveLength(0);
  });

  it('drag handles and the move menu appear only when canDrag', () => {
    render(pf2eProps({ canDrag: true }));
    expect($$('.rel-drag-handle')).toHaveLength(2);
    act(() => {
      fireEvent.contextMenu(rowFor('Mira'));
    });
    expect(showContextMenu).toHaveBeenCalledTimes(1);
    const items = showContextMenu.mock.calls[0][0] as Array<{ label: string; disabled?: boolean }>;
    expect(items.map((i) => i.label)).toEqual(['Move to top', 'Move up', 'Move down']);
    expect(items.map((i) => i.disabled)).toEqual([false, false, true]);

    showContextMenu.mockClear();
    render(pf2eProps({ canDrag: false }));
    expect($$('.rel-drag-handle')).toHaveLength(0);
    act(() => {
      fireEvent.contextMenu(rowFor('Mira'));
    });
    expect(showContextMenu).not.toHaveBeenCalled();
  });

  it('rows with only future changes render faded', () => {
    const future = ledger('aaaa', 'bbbb', pf2e, [delta({ op: 'adjust', by: 5, at: NOW + 1 })]);
    render(props(pf2e, derive(pf2e, [future], 'aaaa')));
    const row = rowFor('Anna');
    expect(row.classList.contains('is-future')).toBe(true);
    expect($('.rel-num-last', row).textContent).toBe('—');
  });

  it('smoke: ten-band track labels all ten bands', () => {
    render(props(tenBands, derive(tenBands, [ledgerRow(tenBands, 25)], 'aaaa')));
    const labels = $$('.rel-num-axis-band');
    expect(labels).toHaveLength(10);
    expect(labels.every((l) => l.title === l.textContent && l.title !== '')).toBe(true);
  });

  it('smoke: no-band track omits the Band column and shows numeric ticks', () => {
    render(props(noBands, derive(noBands, [ledgerRow(noBands, 7)], 'aaaa')));
    expect(headerLabels()).toEqual(['Entries', 'Last change', 'Standing with', 'Value']);
    expect($$('.rel-num-band-label')).toHaveLength(0);
    expect($$('.rel-num-axis-band')).toHaveLength(0);
    expect(text($$('.rel-num-axis-tick'))).toEqual([-10, -5, 0, 5, 10].map(formatNumber));
    expect($$('.rel-num-gridline')).toHaveLength(5);
    expect(rowFor('Anna').style.getPropertyValue('--rel-num-colour')).toBe(
      'var(--theme-accent-gold)',
    );
  });

  it('a no-band track aligns its first tick label to start, its last to end and the rest centre', () => {
    render(props(noBands, derive(noBands, [ledgerRow(noBands, 7)], 'aaaa')));
    const ticks = $$('.rel-num-axis-tick');
    expect(ticks.map((t) => t.classList.contains('is-start'))).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(ticks.map((t) => t.classList.contains('is-end'))).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(ticks[2].classList.contains('is-centre')).toBe(true);
  });

  it('smoke: unbounded track derives its axis from the data', () => {
    const ledgers = [ledgerRow(unbounded, 3, 'bbbb'), ledgerRow(unbounded, 47, 'cccc')];
    render(props(unbounded, derive(unbounded, ledgers, 'aaaa')));
    const ticks = text($$('.rel-num-axis-tick'));
    expect(ticks[0]).toBe(formatNumber(-10));
    expect(ticks[ticks.length - 1]).toBe(formatNumber(60));
  });

  it('no rows shows the empty state; track problems render below', () => {
    render(props(pf2e, derive(pf2e, [], '*'), { trackProblems: [invalidEntry()] }));
    expect($$('.rel-num-row')).toHaveLength(0);
    expect($('.rel-empty code').textContent).toBe('/');
    const problems = $('.rel-track-problems');
    expect(problems.textContent).toContain('Bad amount');
    expect(
      $('.rel-empty').compareDocumentPosition(problems) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('column titles follow the new order', () => {
    render(pf2eProps());
    expect(headerLabels()).toEqual(['Entries', 'Last change', 'Standing with', 'Band', 'Value']);
    expect($$('.rel-num-title').every((t) => t.tagName === 'BUTTON')).toBe(true);

    render(props(noBands, derive(noBands, [ledgerRow(noBands, 7)], 'aaaa')));
    expect(headerLabels()).toEqual(['Entries', 'Last change', 'Standing with', 'Value']);
  });

  it('rows render cells in the same order as the titles', () => {
    const cellClasses = [
      'rel-num-toggle',
      'rel-num-last',
      'rel-num-name',
      'rel-num-band-label',
      'rel-num-value',
    ];
    const titleOrder = ['entries', 'last', 'name', 'band', 'value'];
    const cellOrder = (row: HTMLElement) =>
      Array.from($('.rel-num-left', row).children)
        .slice(1)
        .map((cell) => cellClasses.findIndex((c) => cell.classList.contains(c)));

    render(pf2eProps());
    expect(
      $$('.rel-num-th').map((th) => titleOrder.find((c) => th.classList.contains(`is-${c}`))),
    ).toEqual(titleOrder);
    expect(cellOrder(rowFor('Anna'))).toEqual([0, 1, 2, 3, 4]);

    render(props(noBands, derive(noBands, [ledgerRow(noBands, 7)], 'aaaa')));
    expect(cellOrder(rowFor('Anna'))).toEqual([0, 1, 2, 4]);
  });

  it('the entries toggle shows the arrow and count and flips when expanded', () => {
    render(pf2eProps());
    const toggle = $('.rel-num-toggle', rowFor('Anna'));
    expect($('.rel-num-arrow', toggle).textContent).toBe('▸');
    expect($('.rel-num-count', toggle).textContent).toBe('1');

    const viewOrder: ViewOrder = {
      ...defaultViewOrder(),
      expanded: { [rowListKey(pf2e.id, 'aaaa')]: ['bbbb'] },
    };
    render(pf2eProps({}, viewOrder));
    expect($('.rel-num-arrow', rowFor('Anna')).textContent).toBe('▾');
    expect($('.rel-num-arrow', rowFor('Mira')).textContent).toBe('▸');
  });

  it('clicking a title sorts by it, and the title button names the sort and shows the arrow', () => {
    const p = pf2eProps();
    render(p);
    expect($$('.rel-num-title').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Entries',
      'Last change',
      'Standing with',
      'Band',
      'Value',
    ]);
    expect($$('.rel-num-sort-arrow')).toHaveLength(0);
    expect($$('[role="row"], [role="columnheader"], [aria-sort]')).toHaveLength(0);

    act(() => {
      fireEvent.click($('.rel-num-title', header('Last change')));
    });
    act(() => {
      fireEvent.click($('.rel-num-title', header('Standing with')));
    });
    expect(p.sortByColumn).toHaveBeenNthCalledWith(1, 'last');
    expect(p.sortByColumn).toHaveBeenNthCalledWith(2, 'name');
    expect(p.toggleRow).not.toHaveBeenCalled();

    render(pf2eProps({ sortMode: { column: 'value', dir: 'desc' } }));
    const titleButton = (title: string) => $('.rel-num-title', header(title));
    expect(titleButton('Value').getAttribute('aria-label')).toBe('Value, sorted descending');
    expect($('.rel-num-sort-arrow', header('Value')).textContent).toBe('▼');
    expect($('.rel-num-sort-arrow', header('Value')).getAttribute('aria-hidden')).toBe('true');
    expect(titleButton('Entries').getAttribute('aria-label')).toBe('Entries');
    expect($$('.rel-num-sort-arrow')).toHaveLength(1);

    render(pf2eProps({ sortMode: { column: 'name', dir: 'asc' } }));
    expect(titleButton('Standing with').getAttribute('aria-label')).toBe(
      'Standing with, sorted ascending',
    );
    expect($('.rel-num-sort-arrow', header('Standing with')).textContent).toBe('▲');
    expect(titleButton('Value').getAttribute('aria-label')).toBe('Value');
  });

  it('every title has a resize grip describing its column', () => {
    render(pf2eProps());
    const grip = gripOf('Standing with');
    expect(grip.getAttribute('role')).toBe('separator');
    expect(grip.getAttribute('aria-orientation')).toBe('vertical');
    expect(grip.getAttribute('aria-valuenow')).toBe(String(DEFAULT_COLUMN_WIDTHS.name));
    expect(grip.getAttribute('aria-valuemin')).toBe(String(COLUMN_LIMITS.name.min));
    expect(grip.getAttribute('aria-valuemax')).toBe(String(COLUMN_LIMITS.name.max));
    expect(grip.tabIndex).toBe(0);
    expect(grip.title).toBe('Drag to resize, double-click to reset');
    expect($$('.rel-num-grip')).toHaveLength(5);
  });

  it('dragging a grip resizes its column without sorting', () => {
    const p = pf2eProps();
    render(p);
    const grip = gripOf('Standing with');
    act(() => {
      fireEvent.pointerMove(grip, { pointerId: 1, clientX: 500 });
    });
    expect(p.setColumnWidth).not.toHaveBeenCalled();

    act(() => {
      fireEvent.pointerDown(grip, { pointerId: 1, clientX: 400 });
    });
    act(() => {
      fireEvent.pointerMove(grip, { pointerId: 1, clientX: 430 });
    });
    expect(p.setColumnWidth).toHaveBeenLastCalledWith('name', DEFAULT_COLUMN_WIDTHS.name + 30);
    act(() => {
      fireEvent.pointerMove(grip, { pointerId: 1, clientX: 370 });
    });
    expect(p.setColumnWidth).toHaveBeenLastCalledWith('name', DEFAULT_COLUMN_WIDTHS.name - 30);
    act(() => {
      fireEvent.pointerUp(grip, { pointerId: 1, clientX: 370 });
      fireEvent.click(grip);
    });
    expect(p.setColumnWidth).toHaveBeenCalledTimes(2);

    act(() => {
      fireEvent.pointerMove(grip, { pointerId: 1, clientX: 100 });
    });
    expect(p.setColumnWidth).toHaveBeenCalledTimes(2);
    expect(p.sortByColumn).not.toHaveBeenCalled();
    expect(p.toggleRow).not.toHaveBeenCalled();
  });

  it('a drag starts from the current width, and pressing the grip does not start a text selection', () => {
    const p = pf2eProps({ widths: { ...DEFAULT_COLUMN_WIDTHS, value: 80 } });
    render(p);
    const grip = gripOf('Value');
    const down = new PointerEvent('pointerdown', {
      pointerId: 2,
      clientX: 10,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      grip.dispatchEvent(down);
    });
    expect(down.defaultPrevented).toBe(true);
    act(() => {
      fireEvent.pointerMove(grip, { pointerId: 2, clientX: 25 });
    });
    expect(p.setColumnWidth).toHaveBeenCalledWith('value', 95);
  });

  it('only the primary button starts a drag', () => {
    const p = pf2eProps();
    render(p);
    const grip = gripOf('Standing with');
    act(() => {
      fireEvent.pointerDown(grip, { pointerId: 1, button: 2, clientX: 400 });
    });
    act(() => {
      fireEvent.pointerMove(grip, { pointerId: 1, clientX: 430 });
    });
    expect(p.setColumnWidth).not.toHaveBeenCalled();

    act(() => {
      fireEvent.pointerDown(grip, { pointerId: 1, button: 0, clientX: 400 });
    });
    act(() => {
      fireEvent.pointerMove(grip, { pointerId: 1, clientX: 430 });
    });
    expect(p.setColumnWidth).toHaveBeenCalledTimes(1);
  });

  it('a drag ignores moves from another pointer', () => {
    const p = pf2eProps();
    render(p);
    const grip = gripOf('Standing with');
    act(() => {
      fireEvent.pointerDown(grip, { pointerId: 1, clientX: 400 });
    });
    act(() => {
      fireEvent.pointerMove(grip, { pointerId: 2, clientX: 450 });
    });
    expect(p.setColumnWidth).not.toHaveBeenCalled();
    act(() => {
      fireEvent.pointerMove(grip, { pointerId: 1, clientX: 410 });
    });
    expect(p.setColumnWidth).toHaveBeenCalledTimes(1);
    expect(p.setColumnWidth).toHaveBeenLastCalledWith('name', DEFAULT_COLUMN_WIDTHS.name + 10);
  });

  it("another pointer's pointerup does not end a drag", () => {
    const p = pf2eProps();
    render(p);
    const grip = gripOf('Standing with');
    act(() => {
      fireEvent.pointerDown(grip, { pointerId: 1, clientX: 400 });
    });
    act(() => {
      fireEvent.pointerUp(grip, { pointerId: 2, clientX: 400 });
    });
    act(() => {
      fireEvent.pointerMove(grip, { pointerId: 1, clientX: 410 });
    });
    expect(p.setColumnWidth).toHaveBeenLastCalledWith('name', DEFAULT_COLUMN_WIDTHS.name + 10);
    act(() => {
      fireEvent.pointerUp(grip, { pointerId: 1, clientX: 410 });
    });
    act(() => {
      fireEvent.pointerMove(grip, { pointerId: 1, clientX: 420 });
    });
    expect(p.setColumnWidth).toHaveBeenCalledTimes(1);
  });

  it('double-click resets and arrow keys nudge a column', () => {
    const p = pf2eProps();
    render(p);
    const grip = gripOf('Last change');
    act(() => {
      fireEvent.doubleClick(grip);
    });
    expect(p.resetColumnWidth).toHaveBeenCalledWith('last');
    expect(p.sortByColumn).not.toHaveBeenCalled();

    act(() => {
      fireEvent.keyDown(grip, { key: 'ArrowRight' });
    });
    expect(p.setColumnWidth).toHaveBeenLastCalledWith(
      'last',
      DEFAULT_COLUMN_WIDTHS.last + KEY_RESIZE_STEP,
    );
    act(() => {
      fireEvent.keyDown(grip, { key: 'ArrowLeft' });
    });
    expect(p.setColumnWidth).toHaveBeenLastCalledWith(
      'last',
      DEFAULT_COLUMN_WIDTHS.last - KEY_RESIZE_STEP,
    );
    act(() => {
      fireEvent.keyDown(grip, { key: 'Enter' });
    });
    expect(p.setColumnWidth).toHaveBeenCalledTimes(2);
  });

  it('header and rows share the width template', () => {
    const widths = { ...DEFAULT_COLUMN_WIDTHS, name: 260, band: 120 };
    render(pf2eProps({ widths }));
    const tab = $('.rel-num-tab');
    expect(tab.style.getPropertyValue('--rel-num-template')).toBe(columnTemplate(widths, true));
    expect(tab.style.getPropertyValue('--rel-num-template')).toBe('56px 170px 260px 120px 56px');
    expect(tab.contains($('.rel-num-header .rel-num-left'))).toBe(true);
    expect(tab.contains($('.rel-num-row .rel-num-left'))).toBe(true);

    render(props(noBands, derive(noBands, [ledgerRow(noBands, 7)], 'aaaa'), { widths }));
    expect($('.rel-num-tab').style.getPropertyValue('--rel-num-template')).toBe(
      columnTemplate(widths, false),
    );
  });

  it('bands carry their colour for the tint', () => {
    const p = pf2eProps();
    render(p);
    const { scale } = numericTabModel(pf2e, p.groups, AS_OF);
    const bands = $$('.rel-num-band', rowFor('Anna'));
    expect(bands).toHaveLength(scale.bands.length);
    const colours = bands.map((band) => band.style.getPropertyValue('--rel-num-colour'));
    expect(colours).toEqual(scale.bands.map((span) => span.colour));
    expect(new Set(colours).size).toBeGreaterThan(1);
  });

  it('every second row of a group is striped, with its expanded line', () => {
    render(props(pf2e, derive(pf2e, pf2eLedgers(), '*')));
    const wrappers = $$('.rel-row-wrap');
    expect(wrappers.map((w) => w.classList.contains('is-striped'))).toEqual([false, false, true]);
    expect($$('.rel-num-row.is-striped')).toHaveLength(0);

    const viewOrder: ViewOrder = {
      ...defaultViewOrder(),
      expanded: { [rowListKey(pf2e.id, 'aaaa')]: ['cccc'] },
    };
    render(pf2eProps({}, viewOrder));
    const striped = $('.rel-row-wrap.is-striped');
    expect($('.rel-num-name', striped).textContent).toBe('Mira');
    expect(striped.contains($('.rel-num-expanded'))).toBe(true);
  });

  it('the axis labels and every row plot draw into the same inset layer', () => {
    render(pf2eProps());
    const layers = [$('.rel-num-axis'), ...$$('.rel-num-plot')].map((box) => {
      expect(box.children).toHaveLength(1);
      return box.children[0] as HTMLElement;
    });
    expect(layers).toHaveLength(3);
    layers.forEach((layer) => expect(layer.className).toBe('rel-num-layer'));
    expect($$('.rel-num-axis-band', layers[0])).toHaveLength(7);
    expect($('.rel-num-dot-hit', layers[1])).not.toBeNull();
    expect($('.rel-num-line', layers[2])).not.toBeNull();
  });
});
