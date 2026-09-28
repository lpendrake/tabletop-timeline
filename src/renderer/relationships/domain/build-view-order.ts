/**
 * Pure mapping between the Relationships view's in-memory expand/order state
 * and the persisted `ViewOrder` shape (`view-order.json`). No IO, no React —
 * `useRelationships` calls these instead of constructing/destructuring the
 * file shape inline.
 */
import type { GroupingMode } from './group-relationships';
import type { ViewOrder } from './view-order';

export interface ViewOrderState {
  order: Record<GroupingMode, Record<string, string[]>>;
  /** Expanded outer-row ids, per grouping mode. */
  expandedOuter: Record<GroupingMode, ReadonlySet<string>>;
  /** Expanded inner-row ids (see `innerRowStateKey`), per grouping mode. */
  expandedInner: Record<GroupingMode, ReadonlySet<string>>;
  /** Expanded track-row ids. `TrackRow.key` is mode-independent, so there is
   * only one set — never split or duplicated per mode. */
  expandedTrack: ReadonlySet<string>;
}

/**
 * Builds the `ViewOrder` to persist. Track expansion is mode-independent, so
 * it's written once (under `holder`) — `observer.expanded.track` is always
 * saved empty, instead of duplicating the same list under both sections.
 * `hydrateViewOrder` reads track ids from either section, so this is a
 * backward-compatible change: an older file with the list under both
 * sections still loads correctly.
 */
export function buildViewOrder(state: ViewOrderState): ViewOrder {
  return {
    version: 1,
    holder: {
      order: state.order.holder,
      expanded: {
        outer: Array.from(state.expandedOuter.holder),
        inner: Array.from(state.expandedInner.holder),
        track: Array.from(state.expandedTrack),
      },
    },
    observer: {
      order: state.order.observer,
      expanded: {
        outer: Array.from(state.expandedOuter.observer),
        inner: Array.from(state.expandedInner.observer),
        track: [],
      },
    },
  };
}

/** Inverse of `buildViewOrder`. */
export function hydrateViewOrder(loaded: ViewOrder): ViewOrderState {
  return {
    order: { holder: loaded.holder.order, observer: loaded.observer.order },
    expandedOuter: {
      holder: new Set(loaded.holder.expanded.outer),
      observer: new Set(loaded.observer.expanded.outer),
    },
    expandedInner: {
      holder: new Set(loaded.holder.expanded.inner),
      observer: new Set(loaded.observer.expanded.inner),
    },
    expandedTrack: new Set([...loaded.holder.expanded.track, ...loaded.observer.expanded.track]),
  };
}
