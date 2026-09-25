/**
 * User ordering + collapse state for the Relationships view, persisted to
 * `<campaign>/relationships/view-order.json`. Pure — no IO, no React. The
 * file is sparse and advisory, never authoritative about what rows exist:
 * `applyOrder` appends anything unlisted (alphabetically, via the caller's
 * comparator) after the listed ids, and silently drops ids that are listed
 * but no longer present among the rows being ordered — without ever
 * mutating (or requiring a rewrite of) the stored list itself, so a
 * `parseViewOrder` → `serialiseViewOrder` round trip that touches nothing
 * keeps stale entries intact (see `__tests__/view-order.test.ts`).
 */

import type { GroupingMode } from './group-relationships';

export type RowLevel = 'outer' | 'inner' | 'track';

/** `""` means the top level (outer rows); any other key is an outer row id. */
export interface ViewOrderModeState {
  order: Record<string, string[]>;
  expanded: {
    outer: string[];
    inner: string[];
    track: string[];
  };
}

export interface ViewOrder {
  version: 1;
  holder: ViewOrderModeState;
  observer: ViewOrderModeState;
}

export const TOP_LEVEL_PARENT_KEY = '';

function emptyModeState(): ViewOrderModeState {
  return { order: {}, expanded: { outer: [], inner: [], track: [] } };
}

export function defaultViewOrder(): ViewOrder {
  return { version: 1, holder: emptyModeState(), observer: emptyModeState() };
}

function asStringArray(x: unknown): string[] {
  return Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : [];
}

function parseModeState(x: unknown): ViewOrderModeState {
  if (!x || typeof x !== 'object') return emptyModeState();
  const o = x as Record<string, unknown>;

  const order: Record<string, string[]> = {};
  if (o.order && typeof o.order === 'object') {
    for (const [key, value] of Object.entries(o.order as Record<string, unknown>)) {
      order[key] = asStringArray(value);
    }
  }

  const expandedRaw =
    o.expanded && typeof o.expanded === 'object' ? (o.expanded as Record<string, unknown>) : {};

  return {
    order,
    expanded: {
      outer: asStringArray(expandedRaw.outer),
      inner: asStringArray(expandedRaw.inner),
      track: asStringArray(expandedRaw.track),
    },
  };
}

/** Never throws — garbage or unknown JSON falls back to empty defaults. */
export function parseViewOrder(json: unknown): ViewOrder {
  try {
    if (!json || typeof json !== 'object') return defaultViewOrder();
    const o = json as Record<string, unknown>;
    return {
      version: 1,
      holder: parseModeState(o.holder),
      observer: parseModeState(o.observer),
    };
  } catch {
    return defaultViewOrder();
  }
}

export function serialiseViewOrder(order: ViewOrder): string {
  return JSON.stringify(order, null, 2);
}

/**
 * Orders `ids` using the (possibly sparse/stale) `listed` sequence: listed
 * ids that are present in `ids` keep their listed relative order first;
 * everything else in `ids` is appended after, sorted by `comparator`.
 * Listed ids no longer present in `ids` are simply skipped — never written
 * back or otherwise mutated here.
 */
export function applyOrder(
  ids: readonly string[],
  listed: readonly string[] | undefined,
  comparator: (a: string, b: string) => number,
): string[] {
  const idSet = new Set(ids);
  const listedExisting = (listed ?? []).filter((id) => idSet.has(id));
  const listedSet = new Set(listedExisting);
  const rest = ids.filter((id) => !listedSet.has(id)).sort(comparator);
  return [...listedExisting, ...rest];
}

/** Moves `id` to the front of `visible`. No-op if `id` is absent or already first. */
export function moveToTop(visible: readonly string[], id: string): string[] {
  const list = [...visible];
  if (list.length === 0 || list[0] === id || !list.includes(id)) return list;
  return [id, ...list.filter((x) => x !== id)];
}

/** Swaps `id` with its predecessor. No-op if absent or already first. */
export function moveUp(visible: readonly string[], id: string): string[] {
  const list = [...visible];
  const i = list.indexOf(id);
  if (i <= 0) return list;
  [list[i - 1], list[i]] = [list[i], list[i - 1]];
  return list;
}

/** Swaps `id` with its successor. No-op if absent or already last. */
export function moveDown(visible: readonly string[], id: string): string[] {
  const list = [...visible];
  const i = list.indexOf(id);
  if (i === -1 || i >= list.length - 1) return list;
  [list[i], list[i + 1]] = [list[i + 1], list[i]];
  return list;
}

/** Moves `id` to sit immediately before `targetId`. No-op if either is absent, or they're equal. */
export function moveBefore(visible: readonly string[], id: string, targetId: string): string[] {
  const list = [...visible];
  if (id === targetId || !list.includes(id) || !list.includes(targetId)) return list;
  const without = list.filter((x) => x !== id);
  const idx = without.indexOf(targetId);
  return [...without.slice(0, idx), id, ...without.slice(idx)];
}

/** Moves `id` to sit immediately after `targetId`. No-op if either is absent, or they're equal. */
export function moveAfter(visible: readonly string[], id: string, targetId: string): string[] {
  const list = [...visible];
  if (id === targetId || !list.includes(id) || !list.includes(targetId)) return list;
  const without = list.filter((x) => x !== id);
  const idx = without.indexOf(targetId);
  return [...without.slice(0, idx + 1), id, ...without.slice(idx + 1)];
}

/** Splits a row's rect at its vertical middle: above -> 'before', at/below -> 'after'. */
export function dropPosition(
  pointerY: number,
  rect: { top: number; height: number },
): 'before' | 'after' {
  const middle = rect.top + rect.height / 2;
  return pointerY < middle ? 'before' : 'after';
}

/** The drag payload carried on the custom MIME type for a row drag. */
export interface RowDragPayload {
  mode: GroupingMode;
  level: 'outer' | 'inner';
  /** '' for an outer row (top level); the outer row's id for an inner row. */
  parentKey: string;
  id: string;
}

export interface DropTarget {
  mode: GroupingMode;
  level: 'outer' | 'inner';
  parentKey: string;
}

/**
 * Nested rows reorder within their parent only: a drop is accepted only when
 * the dragged row and the target share the same mode, level and parent.
 */
export function canDrop(payload: RowDragPayload | null | undefined, target: DropTarget): boolean {
  if (!payload) return false;
  return (
    payload.mode === target.mode &&
    payload.level === target.level &&
    payload.parentKey === target.parentKey
  );
}

function stripModePrefix(mode: GroupingMode, keys: readonly string[]): string[] {
  const prefix = `${mode}|`;
  return keys.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
}

/**
 * Converts a flat, mode-prefixed key set (as produced by `outerRowStateKey`
 * / `innerRowStateKey`) into the plain-id array stored for one mode's
 * `expanded.outer` / `expanded.inner`.
 */
export function expandedIdsForMode(
  mode: GroupingMode,
  flatKeys: ReadonlySet<string> | readonly string[],
): string[] {
  return stripModePrefix(mode, Array.from(flatKeys));
}

/**
 * Rebuilds a flat, mode-prefixed key set from a mode's stored plain-id
 * arrays (`expanded.outer` / `expanded.inner`), merging holder and observer
 * ids into one set the way `outerRowStateKey`/`innerRowStateKey` expect.
 */
export function flatKeysFromExpandedIds(mode: GroupingMode, ids: readonly string[]): string[] {
  return ids.map((id) => `${mode}|${id}`);
}
