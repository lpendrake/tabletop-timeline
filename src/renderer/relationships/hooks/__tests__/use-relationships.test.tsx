// @vitest-environment happy-dom
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { EMPTY_TRACK_LIBRARY } from '../../../../shared/relationships';
import type {
  InvalidDirectiveEntry,
  Ledger,
  RelationshipDelta,
} from '../../../../shared/relationships';

const state = vi.hoisted(() => ({
  ledgers: [] as unknown[],
  invalid: [] as unknown[],
  titles: {} as Record<string, string>,
  onChangedCb: null as ((data: { paths: string[] }) => void) | null,
  saveSpy: vi.fn(),
}));

vi.mock('../../data', () => ({
  relationshipsData: {
    getAllLedgers: () => Promise.resolve(state.ledgers),
    getInvalid: () => Promise.resolve(state.invalid),
    getTitles: () => Promise.resolve(state.titles),
    getDefaultHolder: () => Promise.resolve(null),
    onDefaultHolderChanged: () => () => {},
    onChanged: (cb: (data: { paths: string[] }) => void) => {
      state.onChangedCb = cb;
      return () => {
        state.onChangedCb = null;
      };
    },
  },
}));

vi.mock('../../view-order-data', async () => {
  const domain = await vi.importActual<typeof import('../../domain')>('../../domain');
  return {
    viewOrderData: {
      load: () => Promise.resolve(domain.defaultViewOrder()),
      save: (campaignPath: string, order: unknown) => {
        state.saveSpy(campaignPath, order);
        return Promise.resolve();
      },
    },
  };
});

vi.mock('../../../timeline/data/ports', () => ({
  timelinePort: { getState: vi.fn().mockResolvedValue({ in_game_now_seconds: 1000 }) },
}));

import { useRelationships, type RelationshipsViewState } from '../use-relationships';

const labels = new Map(
  Object.entries({ aaaa: 'Zara', bbbb: 'Anna', cccc: 'Mira', dddd: 'Dax', eeee: 'Eve' }),
);

function delta(path: string, at: number | null = 10, by = 1): RelationshipDelta {
  return { op: 'adjust', by, at, declaredIn: { path, ordinal: 0 } };
}
function ledger(holder: string, observer: string, track: string, deltas: RelationshipDelta[]) {
  return { holder, observer, track, deltas } as Ledger;
}

let container: HTMLDivElement;
let root: Root;
let latest: RelationshipsViewState;

function Host({ campaignPath }: { campaignPath: string }) {
  latest = useRelationships({
    campaignPath,
    library: EMPTY_TRACK_LIBRARY,
    entityLabelMap: labels,
    getEntityIndex: () => [],
  });
  return null;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(campaignPath = '/camp-a') {
  act(() => root.render(<Host campaignPath={campaignPath} />));
  await flush();
}

beforeEach(() => {
  localStorage.clear();
  state.ledgers = [
    ledger('aaaa', 'cccc', 'rp01', [delta('timeline/battle.md')]),
    ledger('aaaa', 'dddd', 'rp01', [delta('notes/dax.md', null)]),
    ledger('bbbb', 'cccc', 'rp01', [delta('timeline/battle.md')]),
    ledger('aaaa', 'cccc', 'at01', []),
    ledger('bbbb', 'cccc', 'at01', []),
  ];
  state.invalid = [];
  state.titles = { 'timeline/battle.md': 'Battle of the docks' };
  state.saveSpy.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('use-relationships', () => {
  it('use-relationships reloads titles, ledgers and problems on change', async () => {
    await mount();
    expect(latest.loaded).toBe(true);
    expect(latest.problems).toEqual([]);
    const ids = () => latest.groups.flatMap((g) => g.rows.map((r) => r.observerId));
    const firstGroupHolder = latest.groups[0].holderId;
    act(() => latest.toggleRow(latest.groups[0].listKey, 'cccc'));
    const titleOf = () =>
      latest.groups[0].rows.find((r) => r.observerId === 'cccc')?.history?.[0].eventTitle;
    expect(titleOf()).toBe('Battle of the docks');
    const before = ids().length;

    state.ledgers = [
      ...state.ledgers,
      ledger(firstGroupHolder, 'eeee', 'rp01', [delta('notes/eve.md')]),
    ];
    state.titles = { 'timeline/battle.md': 'Battle of the harbour' };
    const problem: InvalidDirectiveEntry = {
      path: 'notes/bad.md',
      trackId: 'rp01',
      from: 0,
      to: 5,
      messages: ['Unknown note'],
    };
    state.invalid = [problem];
    await act(async () => state.onChangedCb!({ paths: ['notes/bad.md'] }));
    await flush();

    expect(ids().length).toBe(before + 1);
    expect(titleOf()).toBe('Battle of the harbour');
    expect(latest.problems).toEqual([problem]);
    expect(latest.trackProblems).toEqual([problem]);
  });

  it('selected tab and holder persist per campaign and per track', async () => {
    await mount('/camp-a');
    expect(latest.activeTrackId).toBe('rp01');
    act(() => latest.selectTab('at01'));
    act(() => latest.selectHolder('bbbb'));
    expect(latest.activeTrackId).toBe('at01');
    expect(latest.holderPicker.selectedId).toBe('bbbb');
    act(() => latest.selectTab('rp01'));
    act(() => latest.selectHolder('*'));

    // Per track: at01 still remembers bbbb, rp01 remembers All holders.
    act(() => latest.selectTab('at01'));
    expect(latest.holderPicker.selectedId).toBe('bbbb');
    act(() => latest.selectTab('rp01'));
    expect(latest.holderPicker.selectedId).toBe('*');

    // A fresh mount of the same campaign restores the tab and holder.
    act(() => latest.selectTab('at01'));
    act(() => root.unmount());
    root = createRoot(container);
    await mount('/camp-a');
    expect(latest.activeTrackId).toBe('at01');
    expect(latest.holderPicker.selectedId).toBe('bbbb');

    // Another campaign starts fresh.
    act(() => root.unmount());
    root = createRoot(container);
    await mount('/camp-b');
    expect(latest.activeTrackId).toBe('rp01');
    expect(latest.holderPicker.selectedId).not.toBe('bbbb');
  });

  it('moveRow keys order by track + holder', async () => {
    await mount();
    act(() => latest.selectHolder('aaaa'));
    const group = latest.groups[0];
    expect(group.listKey).toBe('rp01:aaaa');
    const [first, second] = group.rows.map((r) => r.observerId);
    act(() => latest.moveRow(group.listKey, second, 'top'));
    expect(latest.groups[0].rows.map((r) => r.observerId)).toEqual([second, first]);

    act(() => root.unmount()); // flushes the debounced save
    const saved = state.saveSpy.mock.calls.at(-1)?.[1] as { order: Record<string, string[]> };
    expect(saved.order['rp01:aaaa']).toEqual([second, first]);
    root = createRoot(container);
  });

  it('search resets when the tab changes and only shows a count while a query is present', async () => {
    await mount();
    expect(latest.countLabel).toBeNull();
    act(() => latest.setQuery('dax'));
    expect(latest.countLabel).toMatch(/^1 of \d+$/);
    act(() => latest.setQuery('nothing-like-this'));
    expect(latest.emptyMessage).toContain('nothing-like-this');
    act(() => latest.selectTab('at01'));
    expect(latest.query).toBe('');
    expect(latest.emptyMessage).toBeNull();
  });
});
