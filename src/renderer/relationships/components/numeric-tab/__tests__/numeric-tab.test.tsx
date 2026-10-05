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
const headerLabels = () => text($$('.rel-num-columns .rel-num-left span')).filter(Boolean);

function rowFor(name: string): HTMLElement {
  const row = $$('.rel-num-row').find((r) => $('.rel-num-name', r).textContent === name);
  if (!row) throw new Error(`no row ${name}`);
  return row;
}

function ledgerRow(track: NumericTrack, value: number, observer = 'bbbb'): Ledger {
  return ledger('aaaa', observer, track, [delta({ op: 'set', value })]);
}

describe('NumericTab', () => {
  it('sticky header holds the toolbar slot and the column labels', () => {
    render(pf2eProps());
    const header = $('.rel-num-header');
    expect($('[data-testid="toolbar"]', header)).not.toBeNull();
    expect(headerLabels()).toEqual(['Standing with', 'Value', 'Band', 'Last change', 'Entries']);
    expect(header.contains($('.rel-num-columns'))).toBe(true);
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

  it('the plot draws the zero line, shaded bands, initial→current line and dot', () => {
    render(pf2eProps());
    const plot = $('.rel-num-plot', rowFor('Anna'));
    expect($('.rel-num-zero', plot).style.left).toBe('50%');
    expect($$('.rel-num-band.is-shaded', plot)).toHaveLength(3);
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
    expect(tip.style.left).toBe(`${at.left}px`);
    expect(tip.style.bottom).toBe(`${at.bottom}px`);
    expect(tip.style.maxWidth).toBe(`${TOOLTIP_MAX_WIDTH}px`);
    act(() => {
      fireEvent.mouseLeave(line);
    });
    expect($('.rel-num-tooltip', document.body)).toBeNull();
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
    expect(headerLabels()).toEqual(['Standing with', 'Value', 'Last change', 'Entries']);
    expect($$('.rel-num-band-label')).toHaveLength(0);
    expect($$('.rel-num-axis-band')).toHaveLength(0);
    expect(text($$('.rel-num-axis-tick'))).toEqual([-10, -5, 0, 5, 10].map(formatNumber));
    expect($$('.rel-num-gridline')).toHaveLength(5);
    expect(rowFor('Anna').style.getPropertyValue('--rel-num-colour')).toBe(
      'var(--theme-accent-gold)',
    );
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
});
