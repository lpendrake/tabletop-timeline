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
  buildEntriesSpy: vi.fn(),
}));

vi.mock('../../domain', async () => {
  const actual = await vi.importActual<typeof import('../../domain')>('../../domain');
  return {
    ...actual,
    buildCategoricalEntries: (...args: Parameters<typeof actual.buildCategoricalEntries>) => {
      state.buildEntriesSpy();
      return actual.buildCategoricalEntries(...args);
    },
  };
});

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

import { loadGroupBy } from '../../view-state-persistence';
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

// Stable identity, as in the app: a fresh function each render would rebuild labelFor.
const getEntityIndex = () => [];

function Host({ campaignPath }: { campaignPath: string }) {
  latest = useRelationships({
    campaignPath,
    library: EMPTY_TRACK_LIBRARY,
    entityLabelMap: labels,
    getEntityIndex,
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
  state.buildEntriesSpy.mockClear();
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

  it('sortByColumn cycles and resets on tab change', async () => {
    await mount();
    expect(latest.sortMode).toBe('mine');
    expect(latest.sortModes).toEqual([]);
    expect(latest.canDrag).toBe(true);

    act(() => latest.sortByColumn('value'));
    expect(latest.sortMode).toEqual({ column: 'value', dir: 'desc' });
    expect(latest.canDrag).toBe(false);
    act(() => latest.sortByColumn('value'));
    expect(latest.sortMode).toEqual({ column: 'value', dir: 'asc' });
    act(() => latest.sortByColumn('value'));
    expect(latest.sortMode).toBe('mine');
    expect(latest.canDrag).toBe(true);

    act(() => latest.sortByColumn('name'));
    expect(latest.sortMode).toEqual({ column: 'name', dir: 'asc' });
    act(() => latest.selectTab('at01'));
    act(() => latest.selectTab('rp01'));
    expect(latest.sortMode).toBe('mine');
  });

  it('titleByPath is exposed', async () => {
    await mount();
    expect(latest.titleByPath.get('timeline/battle.md')).toBe('Battle of the docks');
  });

  describe('categorical track', () => {
    function tagLedger(holder: string, observer: string, key: string): Ledger {
      return {
        holder,
        observer,
        track: 'tg01',
        deltas: [{ op: 'add', key, at: null, declaredIn: { path: 'notes/x.md', ordinal: 0 } }],
      } as unknown as Ledger;
    }

    async function mountCategorical(campaignPath = '/camp-a') {
      state.ledgers = [
        ...state.ledgers,
        tagLedger('aaaa', 'bbbb', 'hates'),
        tagLedger('aaaa', 'cccc', 'member'),
        tagLedger('dddd', 'cccc', 'member'),
      ];
      await mount(campaignPath);
      act(() => latest.selectTab('tg01'));
    }

    it('a categorical track exposes a categorical view, empty groups and no picker', async () => {
      await mountCategorical();
      expect(latest.activeTrack?.kind).toBe('categorical');
      expect(latest.categorical).not.toBeNull();
      expect(latest.categorical?.groupBy).toBe('tag');
      expect(latest.categorical?.total).toBe(3);
      expect(latest.groups).toEqual([]);
      expect(latest.holderPicker.show).toBe(false);
    });

    it('a numeric track still exposes groups and no categorical view', async () => {
      await mountCategorical();
      act(() => latest.selectTab('rp01'));
      expect(latest.categorical).toBeNull();
      expect(latest.groups.length).toBeGreaterThan(0);
    });

    it('N of M and the empty message come from the categorical counts', async () => {
      await mountCategorical();
      act(() => latest.setQuery('dax'));
      expect(latest.categorical?.matched).toBe(1);
      expect(latest.emptyMessage).toBeNull();
      act(() => latest.setQuery('nothing-like-this'));
      expect(latest.countLabel).toBe('0 of 3');
      expect(latest.emptyMessage).toContain('nothing-like-this');
    });

    it('changing group-by updates the view and is restored after remount', async () => {
      await mountCategorical();
      act(() => latest.setGroupBy('entity'));
      expect(latest.groupBy).toBe('entity');
      expect(latest.categorical?.groupBy).toBe('entity');

      act(() => latest.selectTab('rp01'));
      act(() => latest.selectTab('tg01'));
      expect(latest.groupBy).toBe('entity');

      act(() => root.unmount());
      root = createRoot(container);
      await mount('/camp-a');
      expect(latest.activeTrackId).toBe('tg01');
      expect(latest.groupBy).toBe('entity');
      expect(latest.categorical?.groupBy).toBe('entity');
    });

    it('categorical entries are not rebuilt on query keystrokes', async () => {
      await mountCategorical();
      expect(state.buildEntriesSpy).toHaveBeenCalledTimes(1);
      act(() => latest.setQuery('d'));
      act(() => latest.setQuery('da'));
      expect(state.buildEntriesSpy).toHaveBeenCalledTimes(1);
    });

    it('switching campaign does not carry over the group-by choice', async () => {
      await mountCategorical('/camp-a');
      act(() => latest.setGroupBy('entity'));
      expect(latest.groupBy).toBe('entity');

      await mount('/camp-b');
      expect(latest.activeTrackId).toBe('rp01');
      act(() => latest.selectTab('tg01'));
      expect(latest.groupBy).toBe('tag');
      act(() => latest.selectTab('rp01'));
      act(() => latest.selectTab('tg01'));
      expect(latest.groupBy).toBe('tag');
      expect(loadGroupBy('/camp-b', 'tg01')).toBe('tag');
      expect(loadGroupBy('/camp-a', 'tg01')).toBe('entity');
    });

    it('moving an entity card saves the new order to view-order', async () => {
      await mountCategorical();
      act(() => latest.setGroupBy('entity'));
      const listKey = latest.categorical?.listKey;
      expect(listKey).toBe('tg01:entity-cards');
      const ids = latest.categorical!.cards.map((c) => c.id);
      expect(ids.length).toBeGreaterThan(1);
      const last = ids[ids.length - 1];
      act(() => latest.moveRow(listKey!, last, 'top'));
      const expected = [last, ...ids.slice(0, -1)];
      expect(latest.categorical!.cards.map((c) => c.id)).toEqual(expected);

      act(() => root.unmount()); // flushes the debounced save
      const saved = state.saveSpy.mock.calls.at(-1)?.[1] as { order: Record<string, string[]> };
      expect(saved.order['tg01:entity-cards']).toEqual(expected);
      root = createRoot(container);
    });
  });
});
