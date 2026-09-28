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
// rp01 (PF2E Reputation, numeric): Zara→Anna +5 (event "Docks defence", reason "Defended the
// docks"), Zara→Mira −3 (undated note), Kel→Anna +10 (event).
// at01 (Attitude, ordinal): Zara→Anna and Zara→Mira set friendly; Kel→Anna set hostile.
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
      delta({ op: 'set', value: 'friendly', at: T + 20, declaredIn: inDocks(2) }),
    ]),
    ledger('aaaa', 'cccc', 'at01', [
      delta({ op: 'set', value: 'friendly', at: T + 25, declaredIn: inDocks(3) }),
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
const rowNames = () => $$('.rel-row-name').map((n) => n.textContent);
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

function sortOption(label: string): HTMLElement {
  return $$('.rel-sort-option').find((b) => b.textContent === label) as HTMLElement;
}

function rowFor(name: string, scope: HTMLElement = container): HTMLElement {
  const row = Array.from(scope.querySelectorAll<HTMLElement>('.rel-row')).find(
    (r) => r.querySelector('.rel-row-name')?.textContent === name,
  );
  if (!row) throw new Error(`no row ${name}`);
  return row;
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
    expect($$('.rel-row')).toHaveLength(0);
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
    await pickHolder('All holders');
    expect($$('.rel-entry')).toHaveLength(0);

    await search('grain');
    expect(rowNames()).toEqual(['Mira']);
    const entries = $$('.rel-entry');
    expect(entries).toHaveLength(1);
    expect(entries[0].classList.contains('is-hit')).toBe(true);
    expect($$('mark.rel-match').map((m) => m.textContent)).toEqual(['grain']);
    expect($('.rel-entry-reason').textContent).toBe('Stole grain');

    // "docks" matches Zara→Anna by reason and event title; Kel→Anna's entry has the event
    // title "Docks defence" too, so make the dimmed entry come from a word only one entry has.
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
    expect(groups[1].querySelectorAll('.rel-row-name')).toHaveLength(2);

    act(() => {
      fireEvent.click(groups[0].querySelector('.rel-group-header') as HTMLElement);
    });
    expect($$('.rel-group')[0].querySelectorAll('.rel-row')).toHaveLength(0);
  });

  it('drag handles only in My order without a query; moving a row saves under rp01:<holder>', async () => {
    await mount();
    expect($$('.rel-drag-handle')).toHaveLength(2);

    await search('a');
    expect($$('.rel-drag-handle')).toHaveLength(0);
    await search('');
    expect($$('.rel-drag-handle')).toHaveLength(2);

    act(() => {
      fireEvent.click(sortOption('By value'));
    });
    expect($$('.rel-drag-handle')).toHaveLength(0);
    act(() => {
      fireEvent.click(sortOption('My order'));
    });
    expect(rowNames()).toEqual(['Anna', 'Mira']);

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

  it('clicking a name opens the entity note without toggling the row', async () => {
    await mount();
    const row = rowFor('Anna');
    expect(row.getAttribute('aria-expanded')).toBe('false');
    act(() => {
      fireEvent.click(row.querySelector('.rel-row-name') as HTMLElement);
    });
    expect(onOpenById).toHaveBeenCalledWith('bbbb');
    expect(rowFor('Anna').getAttribute('aria-expanded')).toBe('false');
    expect($$('.rel-entry')).toHaveLength(0);

    act(() => {
      fireEvent.click(row);
    });
    expect(rowFor('Anna').getAttribute('aria-expanded')).toBe('true');
  });

  it("dates carry the in-game year and undated entries read 'Undated note'", async () => {
    await mount();
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
    expect(rowFor('Mira').querySelector('.rel-row-last')?.textContent).toBe('−3 Undated note');
    expect(rowFor('Anna').querySelector('.rel-row-last')?.textContent).toBe(`+5 ${dated}`);
  });

  it('a relationship reads the same under a single holder and under All holders', async () => {
    await mount();
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

    await pickHolder('All holders');
    // Expansion is stored per holder list, so the row is still open inside Zara's group.
    expect(snapshot(rowFor('Anna', $$('.rel-group')[1]))).toEqual(single);
  });

  it('shows rung labels in changes rather than raw keys', async () => {
    await mount();
    await selectTab('Attitude');
    expect(rowFor('Anna').querySelector('.rel-row-last')?.textContent).toMatch(/^= Friendly /);
  });
});
