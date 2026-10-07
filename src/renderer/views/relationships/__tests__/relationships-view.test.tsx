// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { fireEvent } from '@testing-library/react';
import type {
  InvalidDirectiveEntry,
  Ledger,
  RelationshipDelta,
} from '../../../../shared/relationships';
import type { EntityIndexEntry } from '../../../../types/global';

// ---- Hoisted mock state (mutable across a test, read inside the mock factories) ----

const state = vi.hoisted(() => ({
  ledgers: [] as unknown[],
  invalid: [] as unknown[],
  titles: {} as Record<string, string>,
  onChangedCb: null as (() => void) | null,
  saveSpy: vi.fn(),
  contextMenuSpy: vi.fn(),
}));

vi.mock('../../../relationships/data', () => ({
  relationshipsData: {
    getAllLedgers: () => Promise.resolve(state.ledgers),
    getInvalid: () => Promise.resolve(state.invalid),
    getTitles: () => Promise.resolve(state.titles),
    getDefaultHolder: () => Promise.resolve(null),
    onDefaultHolderChanged: () => () => {},
    onChanged: (cb: () => void) => {
      state.onChangedCb = cb;
      return () => {
        state.onChangedCb = null;
      };
    },
  },
}));

vi.mock('../../../relationships/view-order-data', async () => {
  const domain = await vi.importActual<typeof import('../../../relationships/domain')>(
    '../../../relationships/domain',
  );
  return {
    viewOrderData: {
      load: () => Promise.resolve(domain.defaultViewOrder()),
      save: (...args: unknown[]) => {
        state.saveSpy(...args);
        return Promise.resolve();
      },
    },
  };
});

vi.mock('../../../timeline/data/ports', () => ({
  timelinePort: {
    getState: vi.fn().mockResolvedValue({ in_game_now_seconds: 4725 * 31_536_000 + 1000 }),
  },
}));

vi.mock('../../../peek/stack', () => ({
  openFromWikiLink: vi.fn(),
  closeFromWikiLink: vi.fn(),
}));

vi.mock('../../../shared/context-menu', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/context-menu')>();
  return {
    ...actual,
    showContextMenu: (...args: Parameters<typeof actual.showContextMenu>) => {
      state.contextMenuSpy(...args);
      return { close: () => {} };
    },
  };
});

import { RelationshipsView } from '../relationships-view';

// ---- Fixtures ----
//
// Holders: aaaa Zara, dddd Kel. Observers: bbbb Anna, cccc Mira.
//
// rp01 (PF2E Reputation, numeric — the numeric tab layout): Zara→Anna +5 (event "Docks defence",
// reason "Defended the docks"), Zara→Mira −3 (undated note, reason "Stole grain"), Kel→Anna +10
// (event).
// at01 (Attitude, ordinal — the placeholder layout with its history list): Zara→Anna set
// friendly (event "Docks defence", reason "Defended the docks"), Zara→Mira set friendly (undated
// note, reason "Shared grain"), Kel→Anna set hostile (event, no reason).
// tg01 (Relationship tags): no ledgers — the empty-state track.

const labels: Record<string, string> = { aaaa: 'Zara', bbbb: 'Anna', cccc: 'Mira', dddd: 'Kel' };
const entityLabelMap = new Map(Object.entries(labels));

const entityIndex: EntityIndexEntry[] = [
  { id: 'e-docks', path: 'timeline/docks.md', title: 'Docks defence', type: 'event' },
];

function delta(
  partial: Partial<RelationshipDelta> & Pick<RelationshipDelta, 'op'>,
): RelationshipDelta {
  return {
    at: null,
    declaredIn: { path: 'notes/npcs/a.md', ordinal: 0 },
    ...partial,
  } as RelationshipDelta;
}

function ledger(
  holder: string,
  observer: string,
  track: string,
  deltas: RelationshipDelta[],
): Ledger {
  return { holder, observer, track, deltas };
}

// Dated entries sit around year 4725 so the year shows in their date labels.
const T = 4725 * 31_536_000;

function inDocks(ordinal: number) {
  return { path: 'timeline/docks.md', ordinal };
}

function fixtureLedgers(): Ledger[] {
  return [
    ledger('aaaa', 'bbbb', 'rp01', [
      delta({
        op: 'adjust',
        by: 5,
        at: T + 10,
        reason: 'Defended the docks',
        declaredIn: inDocks(0),
      }),
    ]),
    ledger('aaaa', 'cccc', 'rp01', [
      delta({
        op: 'adjust',
        by: -3,
        reason: 'Stole grain',
        declaredIn: { path: 'notes/npcs/mira.md', ordinal: 0 },
      }),
    ]),
    ledger('dddd', 'bbbb', 'rp01', [
      delta({ op: 'adjust', by: 10, at: T + 30, declaredIn: inDocks(1) }),
    ]),
    ledger('aaaa', 'bbbb', 'at01', [
      delta({
        op: 'set',
        value: 'friendly',
        at: T + 20,
        reason: 'Defended the docks',
        declaredIn: inDocks(2),
      }),
    ]),
    ledger('aaaa', 'cccc', 'at01', [
      delta({
        op: 'set',
        value: 'friendly',
        reason: 'Shared grain',
        declaredIn: { path: 'notes/npcs/mira.md', ordinal: 0 },
      }),
    ]),
    ledger('dddd', 'bbbb', 'at01', [
      delta({ op: 'set', value: 'hostile', at: T + 26, declaredIn: inDocks(4) }),
    ]),
  ];
}

function invalidEntry(path: string, trackId = 'rp01'): InvalidDirectiveEntry {
  return { path, trackId, ordinal: 0, from: 0, to: 5, messages: ['Bad amount'] };
}

// ---- Harness ----

let container: HTMLDivElement;
let root: Root;
const onOpenById = vi.fn();
const onOpenEvent = vi.fn();

async function flush() {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
}

async function mount(campaignPath = '/camp') {
  act(() =>
    root.render(
      <RelationshipsView
        campaignPath={campaignPath}
        entityLabelMap={entityLabelMap}
        getEntityIndex={() => entityIndex}
        onOpenById={onOpenById}
        onOpenEvent={onOpenEvent}
      />,
    ),
  );
  await flush();
}

async function remount(campaignPath = '/camp') {
  act(() => root.unmount());
  root = createRoot(container);
  await mount(campaignPath);
}

const $ = (sel: string) => container.querySelector(sel) as HTMLElement;
const $$ = (sel: string) => Array.from(container.querySelectorAll(sel)) as HTMLElement[];
const tabButtons = () => $$('[role="tab"]');
// Row cells carry numeric-tab classes (`rel-num-*`) on numeric tracks and placeholder classes
// (`rel-row-*`) on the others; these helpers read whichever tab is showing.
const ROW = '.rel-num-row, .rel-row';
const NAME = '.rel-num-name, .rel-row-name';
const rowNames = () => $$(NAME).map((n) => n.textContent);
const holderName = () => $('.rel-holder-name').textContent;

function tab(name: string): HTMLElement {
  const found = tabButtons().find((t) => t.textContent?.startsWith(name));
  if (!found) throw new Error(`no tab ${name}`);
  return found;
}

function activeTabName() {
  return tabButtons().find((t) => t.getAttribute('aria-selected') === 'true')?.textContent ?? null;
}

async function selectTab(name: string) {
  act(() => {
    fireEvent.click(tab(name));
  });
  await flush();
}

async function pickHolder(label: string) {
  act(() => {
    fireEvent.click($('.rel-holder-button'));
  });
  const option = $$('.searchable-picker-row').find((r) =>
    r.querySelector('.searchable-picker-label')?.textContent?.startsWith(label),
  );
  if (!option) throw new Error(`no holder option ${label}`);
  act(() => {
    fireEvent.mouseDown(option);
  });
  await flush();
}

async function search(query: string) {
  act(() => {
    fireEvent.change($('.rel-search-input'), { target: { value: query } });
  });
  await flush();
}

function toggleScope(label: string) {
  const chip = $$('.rel-scope').find((s) => s.textContent === label);
  if (!chip) throw new Error(`no scope ${label}`);
  act(() => {
    fireEvent.click(chip);
  });
}

function rowFor(name: string, scope: HTMLElement = container): HTMLElement {
  const row = Array.from(scope.querySelectorAll<HTMLElement>(ROW)).find(
    (r) => r.querySelector(NAME)?.textContent === name,
  );
  if (!row) throw new Error(`no row ${name}`);
  return row;
}

function titleCell(title: string): HTMLElement {
  const cell = $$('.rel-num-th').find(
    (th) => th.querySelector('.rel-num-title-label')?.textContent === title,
  );
  if (!cell) throw new Error(`no column title ${title}`);
  return cell;
}

const titleLabel = (title: string) =>
  titleCell(title).querySelector('.rel-num-title')!.getAttribute('aria-label');

const gripOf = (title: string) => titleCell(title).querySelector('.rel-num-grip') as HTMLElement;

function clickTitle(title: string) {
  act(() => {
    fireEvent.click(titleCell(title).querySelector('.rel-num-title') as HTMLElement);
  });
}

beforeEach(() => {
  localStorage.clear();
  state.ledgers = fixtureLedgers();
  state.invalid = [];
  state.titles = { 'timeline/docks.md': 'Docks defence' };
  state.onChangedCb = null;
  state.saveSpy.mockClear();
  state.contextMenuSpy.mockClear();
  onOpenById.mockClear();
  onOpenEvent.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('RelationshipsView', () => {
  it('one tab per track in track order with kind · count', async () => {
    await mount();
    expect(tabButtons().map((t) => t.textContent)).toEqual([
      'PF2E Reputation numeric · 3',
      'Attitude ordinal · 3',
      'Relationship tags categorical · 0',
    ]);
    expect(activeTabName()).toContain('PF2E Reputation');
  });

  it("a track with no relationships shows the '/' empty state", async () => {
    await mount();
    await selectTab('Relationship tags');
    const empty = $('.rel-empty');
    expect(empty.textContent).toBe(
      'No Relationship tags changes yet. Type / in an event or note and choose Relationships › Relationship tags.',
    );
    expect(empty.querySelector('code')?.textContent).toBe('/');
    expect($$(ROW)).toHaveLength(0);
  });

  it('the selected tab persists per campaign', async () => {
    await mount('/camp-a');
    await selectTab('Attitude');
    expect(activeTabName()).toContain('Attitude');

    await remount('/camp-a');
    expect(activeTabName()).toContain('Attitude');

    await remount('/camp-b');
    expect(activeTabName()).toContain('PF2E Reputation');
  });

  it('the selected holder persists per track', async () => {
    await mount();
    expect(holderName()).toBe('Zara');
    await pickHolder('Kel');
    expect(holderName()).toBe('Kel');
    expect(rowNames()).toEqual(['Anna']);

    await selectTab('Attitude');
    expect(holderName()).toBe('Zara');
    await selectTab('PF2E Reputation');
    expect(holderName()).toBe('Kel');

    await remount();
    expect(holderName()).toBe('Kel');
    await selectTab('Attitude');
    expect(holderName()).toBe('Zara');
  });

  it('the problems badge counts invalid directives and lists them', async () => {
    state.invalid = [invalidEntry('timeline/docks.md'), invalidEntry('notes/npcs/mira.md')];
    await mount();
    const pill = $('.rel-problems-pill');
    expect(pill.textContent).toBe('2 problems');

    act(() => {
      fireEvent.click(pill);
    });
    const items = $$('.rel-problems-list .rel-problem');
    expect(items.map((i) => i.querySelector('.rel-problem-path')?.textContent)).toEqual([
      'timeline/docks.md',
      'notes/npcs/mira.md',
    ]);
    expect(items[0].textContent).toContain('Bad amount');

    act(() => {
      fireEvent.click(items[0].querySelector('.rel-problem-open') as HTMLElement);
    });
    expect(onOpenEvent).toHaveBeenCalledWith('docks.md');
  });

  it('an unfinished draft does not change the problems count', async () => {
    // The index never reports drafts, so a file holding only a draft leaves getInvalid unchanged.
    await mount();
    expect($('.rel-problems-pill')).toBeNull();

    await act(async () => {
      state.onChangedCb?.();
    });
    await flush();
    expect($('.rel-problems-pill')).toBeNull();

    state.invalid = [invalidEntry('timeline/docks.md')];
    await act(async () => {
      state.onChangedCb?.();
    });
    await flush();
    expect($('.rel-problems-pill').textContent).toBe('1 problem');

    // Another file gains only a draft: the index still reports the same single invalid entry.
    await act(async () => {
      state.onChangedCb?.();
    });
    await flush();
    expect($('.rel-problems-pill').textContent).toBe('1 problem');
  });

  it('search: words combine as AND and N of M shows; × clears', async () => {
    await mount();
    await pickHolder('All holders');
    expect(rowNames()).toEqual(['Anna', 'Anna', 'Mira']);

    await search('an');
    expect($('.rel-search-count').textContent).toBe('2 of 3');
    expect(rowNames()).toEqual(['Anna', 'Anna']);

    await search('an grain');
    expect($('.rel-search-count').textContent).toBe('0 of 3');
    expect($('.rel-empty').textContent).toBe('Nothing matches "an grain"');

    await search('mira grain');
    expect($('.rel-search-count').textContent).toBe('1 of 3');
    expect(rowNames()).toEqual(['Mira']);

    act(() => {
      fireEvent.click($('.rel-search-clear'));
    });
    await flush();
    expect(($('.rel-search-input') as HTMLInputElement).value).toBe('');
    expect($('.rel-search-count')).toBeNull();
    expect(rowNames()).toEqual(['Anna', 'Anna', 'Mira']);
  });

  it('search: disabling a scope excludes it and the empty message mentions enabled scopes', async () => {
    await mount();
    await search('mira');
    expect(rowNames()).toEqual(['Mira']);

    toggleScope('Name');
    await flush();
    expect(rowNames()).toEqual([]);
    expect($('.rel-empty').textContent).toBe('Nothing matches "mira" in the enabled scopes');
    expect($('.rel-search-count').textContent).toBe('0 of 2');

    toggleScope('Name');
    await flush();
    expect(rowNames()).toEqual(['Mira']);
  });

  it('search through history auto-opens rows, tints hits and dims the rest', async () => {
    await mount();
    await selectTab('Attitude');
    await pickHolder('Anyone');
    expect($$('.rel-entry')).toHaveLength(0);

    await search('grain');
    expect(rowNames()).toEqual(['Mira']);
    const entries = $$('.rel-entry');
    expect(entries).toHaveLength(1);
    expect(entries[0].classList.contains('is-hit')).toBe(true);
    expect($$('mark.rel-match').map((m) => m.textContent)).toEqual(['grain']);
    expect($('.rel-entry-reason').textContent).toBe('Shared grain');

    // Zara→Anna matches by name and by reason; Kel→Anna matches by name only.
    await search('anna defended');
    expect(rowNames()).toEqual(['Anna']);
    expect($$('.rel-entry.is-hit')).toHaveLength(1);
    expect($$('mark.rel-match').map((m) => m.textContent)).toEqual(['Defended']);
  });

  it('All holders groups rows by holder', async () => {
    await mount();
    await pickHolder('All holders');
    const groups = $$('.rel-group');
    expect(groups.map((g) => g.querySelector('.rel-group-name')?.textContent)).toEqual([
      'Kel',
      'Zara',
    ]);
    expect(groups.map((g) => g.querySelector('.rel-group-count')?.textContent)).toEqual([
      'standing with 1',
      'standing with 2',
    ]);
    expect(groups[1].querySelectorAll('.rel-num-name')).toHaveLength(2);

    act(() => {
      fireEvent.click(groups[0].querySelector('.rel-group-header') as HTMLElement);
    });
    expect($$('.rel-group')[0].querySelectorAll('.rel-num-row')).toHaveLength(0);
  });

  it('drag handles only in My order without a query; moving a row saves under rp01:<holder>', async () => {
    await mount();
    expect($$('.rel-drag-handle')).toHaveLength(2);

    await search('a');
    expect($$('.rel-drag-handle')).toHaveLength(0);
    await search('');
    expect($$('.rel-drag-handle')).toHaveLength(2);

    act(() => {
      fireEvent.contextMenu(rowFor('Anna'));
    });
    const items = state.contextMenuSpy.mock.calls[0][0] as Array<{
      label: string;
      onSelect: () => void;
    }>;
    act(() => {
      items.find((i) => i.label === 'Move down')!.onSelect();
    });
    expect(rowNames()).toEqual(['Mira', 'Anna']);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(state.saveSpy).toHaveBeenCalled();
    const saved = state.saveSpy.mock.calls.at(-1)![1] as { order: Record<string, string[]> };
    expect(saved.order['rp01:aaaa']).toEqual(['cccc', 'bbbb']);
  });

  it('clicking a column title hides drag handles; the third click restores My order', async () => {
    await mount();
    act(() => {
      fireEvent.contextMenu(rowFor('Anna'));
    });
    const items = state.contextMenuSpy.mock.calls[0][0] as Array<{
      label: string;
      onSelect: () => void;
    }>;
    act(() => {
      items.find((i) => i.label === 'Move down')!.onSelect();
    });
    expect(rowNames()).toEqual(['Mira', 'Anna']);
    expect($$('.rel-drag-handle')).toHaveLength(2);

    clickTitle('Value');
    expect($$('.rel-drag-handle')).toHaveLength(0);
    expect(rowNames()).toEqual(['Anna', 'Mira']);
    expect(titleLabel('Value')).toBe('Value, sorted descending');

    clickTitle('Value');
    expect($$('.rel-drag-handle')).toHaveLength(0);
    expect(rowNames()).toEqual(['Mira', 'Anna']);
    expect(titleLabel('Value')).toBe('Value, sorted ascending');

    clickTitle('Value');
    expect($$('.rel-drag-handle')).toHaveLength(2);
    expect(rowNames()).toEqual(['Mira', 'Anna']);
    expect(titleLabel('Value')).toBe('Value');
  });

  it('sorting by a column title also hides the group handles under All holders', async () => {
    await mount();
    await pickHolder('All holders');
    expect($$('.rel-drag-handle')).toHaveLength(5);

    clickTitle('Standing with');
    expect($$('.rel-drag-handle')).toHaveLength(0);
    expect(titleLabel('Standing with')).toBe('Standing with, sorted ascending');

    clickTitle('Standing with');
    expect($$('.rel-drag-handle')).toHaveLength(0);
    clickTitle('Standing with');
    expect($$('.rel-drag-handle')).toHaveLength(5);
  });

  it('column widths persist per campaign', async () => {
    await mount('/camp-a');
    const defaultName = Number(gripOf('Standing with').getAttribute('aria-valuenow'));
    act(() => {
      fireEvent.pointerDown(gripOf('Standing with'), { pointerId: 1, clientX: 100 });
    });
    // Each move is measured from where the drag started, however often the view re-renders.
    act(() => {
      fireEvent.pointerMove(gripOf('Standing with'), { pointerId: 1, clientX: 130 });
    });
    expect(gripOf('Standing with').getAttribute('aria-valuenow')).toBe(String(defaultName + 30));
    act(() => {
      fireEvent.pointerMove(gripOf('Standing with'), { pointerId: 1, clientX: 160 });
    });
    act(() => {
      fireEvent.pointerUp(gripOf('Standing with'), { pointerId: 1, clientX: 160 });
    });
    expect(gripOf('Standing with').getAttribute('aria-valuenow')).toBe(String(defaultName + 60));
    expect($('.rel-num-tab').style.getPropertyValue('--rel-num-template')).toContain(
      `${defaultName + 60}px`,
    );

    await remount('/camp-a');
    expect(gripOf('Standing with').getAttribute('aria-valuenow')).toBe(String(defaultName + 60));

    await remount('/camp-b');
    expect(gripOf('Standing with').getAttribute('aria-valuenow')).toBe(String(defaultName));
  });

  it('losing pointer capture ends a column drag', async () => {
    await mount();
    const defaultName = Number(gripOf('Standing with').getAttribute('aria-valuenow'));
    act(() => {
      fireEvent.pointerDown(gripOf('Standing with'), { pointerId: 1, clientX: 100 });
    });
    act(() => {
      fireEvent.pointerMove(gripOf('Standing with'), { pointerId: 1, clientX: 120 });
    });
    act(() => {
      fireEvent.lostPointerCapture(gripOf('Standing with'), { pointerId: 1 });
    });
    act(() => {
      fireEvent.pointerMove(gripOf('Standing with'), { pointerId: 1, clientX: 200 });
    });
    expect(gripOf('Standing with').getAttribute('aria-valuenow')).toBe(String(defaultName + 20));
  });

  it('clicking a name opens the entity note without toggling the row', async () => {
    await mount();
    const row = rowFor('Anna');
    expect(row.getAttribute('aria-expanded')).toBe('false');
    act(() => {
      fireEvent.click(row.querySelector('.rel-num-name') as HTMLElement);
    });
    expect(onOpenById).toHaveBeenCalledWith('bbbb');
    expect(rowFor('Anna').getAttribute('aria-expanded')).toBe('false');
    expect($$('.rel-num-expanded')).toHaveLength(0);

    act(() => {
      fireEvent.click(row);
    });
    expect(rowFor('Anna').getAttribute('aria-expanded')).toBe('true');
  });

  it("last change dates carry the in-game year and undated entries read 'Undated note'", async () => {
    await mount();
    expect(rowFor('Mira').querySelector('.rel-num-last')?.textContent).toBe('−3 Undated note');
    const annaLast = rowFor('Anna').querySelector('.rel-num-last')!;
    expect(annaLast.querySelector('.rel-num-amount')?.textContent).toBe('+5');
    expect(annaLast.querySelector('.rel-num-date')?.textContent).toMatch(/\d{4}/);
  });

  it('clicking a numeric row expands it and shows the numeric placeholder', async () => {
    await mount();
    expect($$('.rel-num-expanded')).toHaveLength(0);
    act(() => {
      fireEvent.click(rowFor('Anna'));
    });
    expect(rowFor('Anna').getAttribute('aria-expanded')).toBe('true');
    expect($$('.rel-num-expanded')).toHaveLength(1);
    expect(rowFor('Anna').parentElement!.querySelector('.rel-num-expanded')).not.toBeNull();
    expect($$('.rel-entry')).toHaveLength(0);

    act(() => {
      fireEvent.click(rowFor('Anna'));
    });
    expect($$('.rel-num-expanded')).toHaveLength(0);
  });

  it('a relationship reads the same under a single holder and under All holders', async () => {
    await mount();
    const snapshot = (row: HTMLElement) => ({
      value: row.querySelector('.rel-num-value')?.textContent,
      band: row.querySelector('.rel-num-band-label')?.textContent,
      last: row.querySelector('.rel-num-last')?.textContent,
      count: row.querySelector('.rel-num-count')?.textContent,
    });
    const single = { Anna: snapshot(rowFor('Anna')), Mira: snapshot(rowFor('Mira')) };
    expect(single.Anna.count).toBe('1');
    expect(single.Anna.last).toMatch(/^\+5 /);
    expect(single.Mira.last).toBe('−3 Undated note');

    await pickHolder('All holders');
    const zara = $$('.rel-group')[1];
    expect(zara.querySelector('.rel-group-name')?.textContent).toBe('Zara');
    expect({ Anna: snapshot(rowFor('Anna', zara)), Mira: snapshot(rowFor('Mira', zara)) }).toEqual(
      single,
    );
  });

  it('the toolbar renders inside the numeric tab sticky header', async () => {
    await mount();
    const header = $('.rel-num-tab > .rel-num-header');
    expect(header).not.toBeNull();
    expect(header.querySelector('.rel-search-input')).not.toBeNull();
    expect(header.querySelector('.rel-holder-button')).not.toBeNull();
    expect($$('.rel-search-input')).toHaveLength(1);
    expect(header.querySelector('.rel-num-columns')).not.toBeNull();
  });

  it('under All holders, a search matching one holder keeps its header and hides the other group', async () => {
    await mount();
    await pickHolder('All holders');
    expect($$('.rel-group-header')).toHaveLength(2);

    await search('mira');
    expect($$('.rel-group-header')).toHaveLength(1);
    expect($('.rel-group-header .rel-group-name').textContent).toBe('Zara');
    expect(rowNames()).toEqual(['Mira']);

    await search('anna');
    expect($$('.rel-group-header .rel-group-name').map((n) => n.textContent)).toEqual([
      'Kel',
      'Zara',
    ]);
  });

  it('drag moves persist group order under rp01:* in All holders', async () => {
    await mount();
    await pickHolder('All holders');
    act(() => {
      fireEvent.contextMenu($$('.rel-group-header')[0]);
    });
    const items = state.contextMenuSpy.mock.calls[0][0] as Array<{
      label: string;
      onSelect: () => void;
    }>;
    act(() => {
      items.find((i) => i.label === 'Move down')!.onSelect();
    });
    expect($$('.rel-group-name').map((n) => n.textContent)).toEqual(['Zara', 'Kel']);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    const saved = state.saveSpy.mock.calls.at(-1)![1] as { order: Record<string, string[]> };
    expect(saved.order['rp01:*']).toEqual(['aaaa', 'dddd']);
  });

  describe('Attitude tab (placeholder layout)', () => {
    it('renders the placeholder body rather than the numeric tab', async () => {
      await mount();
      expect($('.rel-num-tab')).not.toBeNull();
      expect($('.rel-placeholder-body')).toBeNull();

      await selectTab('Attitude');
      expect($('.rel-num-tab')).toBeNull();
      expect($('.rel-placeholder-body')).not.toBeNull();
      expect($$('.rel-row')).toHaveLength(2);
      expect($$('.rel-search-input')).toHaveLength(1);
    });

    it('clicking a name opens the entity note without toggling the row, and a row click shows history', async () => {
      await mount();
      await selectTab('Attitude');
      const row = rowFor('Anna');
      act(() => {
        fireEvent.click(row.querySelector('.rel-row-name') as HTMLElement);
      });
      expect(onOpenById).toHaveBeenCalledWith('bbbb');
      expect(rowFor('Anna').getAttribute('aria-expanded')).toBe('false');
      expect($$('.rel-entry')).toHaveLength(0);

      act(() => {
        fireEvent.click(row);
      });
      expect($$('.rel-entry')).toHaveLength(1);
    });

    it("history dates carry the in-game year and undated entries read 'Undated note'", async () => {
      await mount();
      await selectTab('Attitude');
      act(() => {
        fireEvent.click(rowFor('Anna'));
      });
      act(() => {
        fireEvent.click(rowFor('Mira'));
      });
      const dates = $$('.rel-entry-date').map((d) => d.textContent ?? '');
      expect(dates).toHaveLength(2);
      expect(dates.filter((d) => d === 'Undated note')).toHaveLength(1);
      const dated = dates.find((d) => d !== 'Undated note') as string;
      expect(dated).toMatch(/\d{4}/);
      expect(rowFor('Mira').querySelector('.rel-row-last')?.textContent).toBe(
        '= Friendly Undated note',
      );
      expect(rowFor('Anna').querySelector('.rel-row-last')?.textContent).toBe(
        `= Friendly ${dated}`,
      );
    });

    it('opening an event from its history entry opens the event file', async () => {
      await mount();
      await selectTab('Attitude');
      act(() => {
        fireEvent.click(rowFor('Anna'));
      });
      const title = $('.rel-entry-event');
      expect(title.textContent).toBe('Docks defence');
      act(() => {
        fireEvent.click(title);
      });
      expect(onOpenEvent).toHaveBeenCalledWith('docks.md');
      expect(rowFor('Anna').getAttribute('aria-expanded')).toBe('true');
    });

    it('a relationship reads the same under a single holder and under Anyone', async () => {
      await mount();
      await selectTab('Attitude');
      const snapshot = (row: HTMLElement) => ({
        value: row.querySelector('.rel-row-value')?.textContent,
        state: row.querySelector('.rel-row-state')?.textContent,
        last: row.querySelector('.rel-row-last')?.textContent,
        count: row.querySelector('.rel-row-count')?.textContent,
        entries: Array.from(row.parentElement!.querySelectorAll('.rel-entry')).map(
          (e) => e.textContent,
        ),
      });
      act(() => {
        fireEvent.click(rowFor('Anna'));
      });
      const single = snapshot(rowFor('Anna'));
      expect(single.entries).toHaveLength(1);

      await pickHolder('Anyone');
      // Expansion is stored per holder list, so the row is still open inside Zara's group.
      expect(snapshot(rowFor('Anna', $$('.rel-group')[1]))).toEqual(single);
    });

    it('shows rung labels in changes rather than raw keys', async () => {
      await mount();
      await selectTab('Attitude');
      expect(rowFor('Anna').querySelector('.rel-row-last')?.textContent).toMatch(/^= Friendly /);
    });
  });
});
