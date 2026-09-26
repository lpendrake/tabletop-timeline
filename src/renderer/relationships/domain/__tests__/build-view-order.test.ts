import { describe, it, expect } from 'vitest';
import { buildViewOrder, hydrateViewOrder, type ViewOrderState } from '../build-view-order';
import type { ViewOrder } from '../view-order';

function state(overrides: Partial<ViewOrderState> = {}): ViewOrderState {
  return {
    order: { holder: {}, observer: {} },
    expandedOuter: { holder: new Set(), observer: new Set() },
    expandedInner: { holder: new Set(), observer: new Set() },
    expandedTrack: new Set(),
    ...overrides,
  };
}

describe('buildViewOrder', () => {
  it('writes track expansion once, under holder, never duplicated under observer', () => {
    const result = buildViewOrder(state({ expandedTrack: new Set(['t1', 't2']) }));
    expect(result.holder.expanded.track).toEqual(['t1', 't2']);
    expect(result.observer.expanded.track).toEqual([]);
  });

  it('writes outer/inner expansion per mode without any prefixing', () => {
    const result = buildViewOrder(
      state({
        expandedOuter: { holder: new Set(['a']), observer: new Set(['b']) },
        expandedInner: { holder: new Set(['a|c']), observer: new Set() },
      }),
    );
    expect(result.holder.expanded.outer).toEqual(['a']);
    expect(result.observer.expanded.outer).toEqual(['b']);
    expect(result.holder.expanded.inner).toEqual(['a|c']);
    expect(result.observer.expanded.inner).toEqual([]);
  });
});

describe('hydrateViewOrder', () => {
  it('is the inverse of buildViewOrder', () => {
    const original = state({
      order: { holder: { '': ['a'] }, observer: {} },
      expandedOuter: { holder: new Set(['a']), observer: new Set(['b']) },
      expandedInner: { holder: new Set(['a|c']), observer: new Set() },
      expandedTrack: new Set(['t1']),
    });
    const round = hydrateViewOrder(buildViewOrder(original));
    expect(round).toEqual(original);
  });

  it('reads track ids that an older file duplicated under both sections', () => {
    const loaded: ViewOrder = {
      version: 1,
      holder: { order: {}, expanded: { outer: [], inner: [], track: ['t1', 't2'] } },
      observer: { order: {}, expanded: { outer: [], inner: [], track: ['t1', 't2'] } },
    };
    expect(hydrateViewOrder(loaded).expandedTrack).toEqual(new Set(['t1', 't2']));
  });

  it('unions track ids split across both sections', () => {
    const loaded: ViewOrder = {
      version: 1,
      holder: { order: {}, expanded: { outer: [], inner: [], track: ['t1'] } },
      observer: { order: {}, expanded: { outer: [], inner: [], track: ['t2'] } },
    };
    expect(hydrateViewOrder(loaded).expandedTrack).toEqual(new Set(['t1', 't2']));
  });
});
