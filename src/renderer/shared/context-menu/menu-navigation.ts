/**
 * Pure keyboard-highlight movement over one level of a `ContextMenuItem[]`
 * tree, plus small path helpers used to walk into/out of nested submenus.
 * No DOM access, no React — see `context-menu.tsx` for how this is wired to
 * component state.
 */
import type { ContextMenuItem } from './types';

/** An action or submenu row that isn't disabled — the only navigable kinds. */
export function isNavigable(item: ContextMenuItem | undefined): boolean {
  if (!item) return false;
  return (item.kind === 'action' || item.kind === 'submenu') && !item.disabled;
}

/**
 * Finds the next (dir=1) or previous (dir=-1) navigable index in `items`,
 * starting from `current` (pass -1 to start "before" the first item) and
 * wrapping around. Skips separators, headers and disabled items. Returns
 * `null` when nothing in `items` is navigable.
 */
export function nextNavigableIndex(
  items: readonly ContextMenuItem[],
  current: number,
  dir: 1 | -1,
): number | null {
  const n = items.length;
  if (n === 0) return null;
  let i = current;
  for (let step = 0; step < n; step++) {
    i = (((i + dir) % n) + n) % n;
    if (isNavigable(items[i])) return i;
  }
  return null;
}

/** The first navigable index in `items`, or `null` if there is none. */
export function firstNavigableIndex(items: readonly ContextMenuItem[]): number | null {
  return nextNavigableIndex(items, -1, 1);
}

function isDanger(item: ContextMenuItem): boolean {
  return (item.kind === 'action' || item.kind === 'submenu') && item.variant === 'danger';
}

/**
 * The first navigable index in `items` that isn't a danger item (e.g. a
 * "Delete" action), or `null` if every navigable item is danger. Used to
 * pick the highlight a menu opens with — a danger item should never be
 * pre-highlighted, the same way it's never the automatic search target (see
 * `pickAutoTarget` in `menu-search.ts`).
 */
export function firstNonDangerNavigableIndex(items: readonly ContextMenuItem[]): number | null {
  const index = items.findIndex((item) => isNavigable(item) && !isDanger(item));
  return index === -1 ? null : index;
}

/**
 * Walks `path` (a chain of indices, each expected to land on a `submenu`
 * item except possibly the last) and returns the `ContextMenuItem[]` living
 * at that depth. An empty path returns `items` itself. Returns `null` if the
 * path doesn't resolve (out-of-range index, or an intermediate item isn't an
 * unbounded submenu).
 */
export function itemsAtPath(
  items: readonly ContextMenuItem[],
  path: readonly number[],
): ContextMenuItem[] | null {
  let level: readonly ContextMenuItem[] = items;
  for (const index of path) {
    const item = level[index];
    if (!item || item.kind !== 'submenu') return null;
    level = item.items;
  }
  return level as ContextMenuItem[];
}

/** Resolves the single item at `path`, or `null` if the path doesn't resolve. */
export function itemAtPath(
  items: readonly ContextMenuItem[],
  path: readonly number[],
): ContextMenuItem | null {
  if (path.length === 0) return null;
  const parent = itemsAtPath(items, path.slice(0, -1));
  if (!parent) return null;
  return parent[path[path.length - 1]] ?? null;
}

export function pathsEqual(a: readonly number[] | null, b: readonly number[] | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/** Whether `prefix` is a (possibly-equal) leading slice of `path`. */
export function isPathPrefix(prefix: readonly number[], path: readonly number[]): boolean {
  if (prefix.length > path.length) return false;
  return prefix.every((v, i) => v === path[i]);
}
