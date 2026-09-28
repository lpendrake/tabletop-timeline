/**
 * User ordering + expand/collapse state for the by-track Relationships view,
 * persisted to `<campaign>/relationships/view-order.json`. Pure — no IO, no
 * React. The file is sparse and advisory, never authoritative about what rows
 * exist: `applyOrder` appends anything unlisted (alphabetically, via the
 * caller's comparator) after the listed ids and silently drops listed ids that
 * are no longer present — without mutating the stored list, so stale ids
 * survive until a move rewrites that key's list (see `withListOrder`).
 *
 * Every list is keyed by track + holder (see the key builders below).
 */

export interface ViewOrder {
  version: 2;
  /** listKey -> ids in the user's order. */
  order: Record<string, string[]>;
  /** rowListKey -> observer ids of expanded rows. */
  expanded: Record<string, string[]>;
  /** groupListKey -> holder ids of collapsed All-holders groups. */
  collapsed: Record<string, string[]>;
}

/** Key for the observers listed under one holder on a track. */
export function rowListKey(trackId: string, holderId: string): string {
  return `${trackId}:${holderId}`;
}

/** Key for the order of holder groups under *All holders* on a track (`<track>:*`). */
export function groupListKey(trackId: string): string {
  return `${trackId}:*`;
}

/** Reserved for the categorical entity-cards ticket. */
export function entityCardsKey(trackId: string): string {
  return `${trackId}:entity-cards`;
}

export function defaultViewOrder(): ViewOrder {
  return { version: 2, order: {}, expanded: {}, collapsed: {} };
}

function asStringArray(x: unknown): string[] {
  return Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : [];
}

function parseListMap(x: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!x || typeof x !== 'object' || Array.isArray(x)) return out;
  for (const [key, value] of Object.entries(x as Record<string, unknown>)) {
    out[key] = asStringArray(value);
  }
  return out;
}

/** Never throws — a version-1 (#262) file, garbage or unknown JSON falls back to an empty v2 order. */
export function parseViewOrder(json: unknown): ViewOrder {
  try {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return defaultViewOrder();
    const o = json as Record<string, unknown>;
    if (o.version !== 2) return defaultViewOrder();
    return {
      version: 2,
      order: parseListMap(o.order),
      expanded: parseListMap(o.expanded),
      collapsed: parseListMap(o.collapsed),
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
 * Listed ids no longer present in `ids` are simply skipped.
 */
export function applyOrder(
  ids: readonly string[],
  listed: readonly string[] | undefined,
  comparator: (a: string, b: string) => number,
): string[] {
  const idSet = new Set(ids);
  const listedExisting: string[] = [];
  const seen = new Set<string>();
  for (const id of listed ?? []) {
    if (idSet.has(id) && !seen.has(id)) {
      listedExisting.push(id);
      seen.add(id);
    }
  }
  const rest = ids.filter((id) => !seen.has(id)).sort(comparator);
  return [...listedExisting, ...rest];
}

/**
 * Returns a copy of `viewOrder` where `listKey`'s list is the current visible
 * order followed by any stale ids (listed before but not visible now), so
 * moving a row never forgets ordering for rows that are temporarily absent.
 */
export function withListOrder(
  viewOrder: ViewOrder,
  listKey: string,
  visible: readonly string[],
): ViewOrder {
  const visibleSet = new Set(visible);
  const stale = (viewOrder.order[listKey] ?? []).filter((id) => !visibleSet.has(id));
  return { ...viewOrder, order: { ...viewOrder.order, [listKey]: [...visible, ...stale] } };
}

function toggled(list: readonly string[] | undefined, id: string): string[] {
  const current = list ?? [];
  return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
}

/** Toggles an observer id in `expanded[listKey]`. */
export function withToggledExpanded(
  viewOrder: ViewOrder,
  listKey: string,
  observerId: string,
): ViewOrder {
  return {
    ...viewOrder,
    expanded: {
      ...viewOrder.expanded,
      [listKey]: toggled(viewOrder.expanded[listKey], observerId),
    },
  };
}

/** Toggles a holder id in `collapsed[listKey]`. */
export function withToggledCollapsed(
  viewOrder: ViewOrder,
  listKey: string,
  holderId: string,
): ViewOrder {
  return {
    ...viewOrder,
    collapsed: {
      ...viewOrder.collapsed,
      [listKey]: toggled(viewOrder.collapsed[listKey], holderId),
    },
  };
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

/** A move requested by the UI (context menu or drag-and-drop). */
export type RowMove = 'top' | 'up' | 'down' | { before: string } | { after: string };

/** Applies a `RowMove` to a visible order list. */
export function applyRowMove(visible: readonly string[], id: string, to: RowMove): string[] {
  if (to === 'top') return moveToTop(visible, id);
  if (to === 'up') return moveUp(visible, id);
  if (to === 'down') return moveDown(visible, id);
  if ('before' in to) return moveBefore(visible, id, to.before);
  return moveAfter(visible, id, to.after);
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
  listKey: string;
  id: string;
}

export interface DropTarget {
  listKey: string;
}

/** Rows reorder within their own list only: a drop is accepted only when the list keys match. */
export function canDrop(payload: RowDragPayload | null | undefined, target: DropTarget): boolean {
  return !!payload && payload.listKey === target.listKey;
}
