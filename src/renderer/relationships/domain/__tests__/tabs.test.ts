import { describe, it, expect } from 'vitest';
import type { Ledger } from '../../../../shared/relationships/model';
import { EMPTY_TRACK_LIBRARY } from '../../../../shared/relationships/registry';
import {
  buildTabs,
  emptyStateText,
  nextTabIndex,
  problemsLabel,
  resolveActiveTab,
  tabMeta,
} from '../tabs';

describe('nextTabIndex', () => {
  it('nextTabIndex wraps', () => {
    expect(nextTabIndex(0, 3, 'ArrowRight')).toBe(1);
    expect(nextTabIndex(2, 3, 'ArrowRight')).toBe(0);
    expect(nextTabIndex(0, 3, 'ArrowLeft')).toBe(2);
    expect(nextTabIndex(1, 3, 'ArrowLeft')).toBe(0);
    expect(nextTabIndex(1, 3, 'Home')).toBe(0);
    expect(nextTabIndex(0, 3, 'End')).toBe(2);
    expect(nextTabIndex(0, 3, 'x')).toBeNull();
    expect(nextTabIndex(0, 0, 'ArrowRight')).toBeNull();
  });
});

describe('problemsLabel', () => {
  it('pluralises', () => {
    expect(problemsLabel(1)).toBe('1 problem');
    expect(problemsLabel(3)).toBe('3 problems');
  });
});

const ledger = (track: string, holder = 'h', observer = 'o'): Ledger => ({
  holder,
  observer,
  track,
  deltas: [],
});
const library = EMPTY_TRACK_LIBRARY;

describe('tabs', () => {
  it('tabs follow track order and count relationships', () => {
    const tabs = buildTabs({
      library,
      ledgers: [ledger('tg01'), ledger('rp01'), ledger('rp01', 'h2')],
      invalid: [],
    });
    expect(tabs.map((t) => t.trackId)).toEqual(['rp01', 'at01', 'tg01']);
    expect(tabs.map((t) => t.count)).toEqual([2, 0, 1]);
    expect(tabMeta(tabs[0])).toBe('numeric · 2');
    expect(emptyStateText('PF2E Reputation')).toBe(
      'No PF2E Reputation changes yet. Type / in an event or note and choose Relationships › PF2E Reputation.',
    );
    expect(resolveActiveTab(tabs, 'at01')).toBe('at01');
    expect(resolveActiveTab(tabs, 'gone')).toBe('rp01');
    expect(resolveActiveTab([], 'x')).toBeNull();
  });

  it('a disabled track keeps its tab only when referenced', () => {
    const disabledTrackIds = ['at01', 'tg01', 'rp01'];
    expect(buildTabs({ library, disabledTrackIds, ledgers: [], invalid: [] })).toEqual([]);
    const byLedger = buildTabs({
      library,
      disabledTrackIds,
      ledgers: [ledger('at01')],
      invalid: [],
    });
    expect(byLedger.map((t) => t.trackId)).toEqual(['at01']);
    const byInvalid = buildTabs({
      library,
      disabledTrackIds,
      ledgers: [],
      invalid: [{ trackId: 'tg01' }],
    });
    expect(byInvalid.map((t) => t.trackId)).toEqual(['tg01']);
  });

  it('unknown-track invalid entries create no tab', () => {
    const tabs = buildTabs({ library, ledgers: [], invalid: [{ trackId: 'nope' }, {}] });
    expect(tabs.map((t) => t.trackId)).toEqual(['rp01', 'at01', 'tg01']);
  });
});
