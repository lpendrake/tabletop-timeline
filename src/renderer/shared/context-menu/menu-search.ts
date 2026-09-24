/**
 * Pure search/filtering over a `ContextMenuItem[]` tree. No DOM, no React —
 * `context-menu.tsx` wires this to component state.
 *
 * Ranking comes from `rankMatch` in `shared/search/rank.ts` (prefix, then
 * word-prefix, then substring; no fuzzy matching).
 */
import { rankMatch, type MatchRank } from '../search/rank';
import type { ContextMenuItem } from './types';

/** A leaf `action` item that matched the query, reachable while searching. */
export interface MenuTarget {
  /** Indices into the items tree, from the root down to this action. */
  path: number[];
  /** Label path, e.g. ['Formatting', 'Heading', 'Heading 1']. */
  labels: string[];
  rank: MatchRank;
  danger: boolean;
}

/** One visible row while searching: either a matching action, or a submenu kept open because a descendant matches. */
export type FilteredNode =
  | { kind: 'action'; item: Extract<ContextMenuItem, { kind: 'action' }>; path: number[] }
  | {
      kind: 'submenu';
      item: Extract<ContextMenuItem, { kind: 'submenu' }>;
      path: number[];
      children: FilteredNode[];
    };

export interface FilterMenuResult {
  visible: FilteredNode[];
  /** Matching actions, in displayed (depth-first) order, best rank first; ties keep that order. */
  targets: MenuTarget[];
}

/**
 * Filters `items` (and all nested submenus) against `query`. Disabled items
 * are dropped entirely (hidden, not just muted) and never produce a target.
 * A submenu is kept only when at least one descendant matches, and is
 * rendered with only its matching descendants as `children`. Separators and
 * headers are always dropped while searching.
 */
export function filterMenu(items: readonly ContextMenuItem[], query: string): FilterMenuResult {
  const q = query.trim();
  if (!q) return { visible: [], targets: [] };

  const { nodes, targets } = filterLevel(items, q, []);
  const ordered = targets.map((t, index) => ({ t, index }));
  ordered.sort((a, b) => a.t.rank - b.t.rank || a.index - b.index);
  return { visible: nodes, targets: ordered.map((o) => o.t) };
}

function filterLevel(
  items: readonly ContextMenuItem[],
  query: string,
  parentPath: readonly number[],
  parentLabels: readonly string[] = [],
): { nodes: FilteredNode[]; targets: MenuTarget[] } {
  const nodes: FilteredNode[] = [];
  const targets: MenuTarget[] = [];

  items.forEach((item, index) => {
    if (item.kind === 'separator' || item.kind === 'header') return;
    if (item.disabled) return;

    const path = [...parentPath, index];
    const labels = [...parentLabels, item.label];

    if (item.kind === 'action') {
      const rank = rankMatch(item.label, query, item.keywords);
      if (rank === null) return;
      nodes.push({ kind: 'action', item, path });
      targets.push({ path, labels, rank, danger: item.variant === 'danger' });
      return;
    }

    // submenu
    const sub = filterLevel(item.items, query, path, labels);
    if (sub.nodes.length === 0) return;
    nodes.push({ kind: 'submenu', item, path, children: sub.nodes });
    targets.push(...sub.targets);
  });

  return { nodes, targets };
}

/**
 * Picks the target that typing should jump to: the best-ranked non-danger
 * target. Danger items are only ever reached by arrowing to them, never
 * auto-targeted — so typing "de" + Enter can't fire a destructive action by
 * accident. Returns `null` when there's no such target (including when the
 * only matches are danger items).
 */
export function pickAutoTarget(targets: readonly MenuTarget[]): MenuTarget | null {
  return targets.find((t) => !t.danger) ?? null;
}
