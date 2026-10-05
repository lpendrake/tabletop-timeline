/**
 * Sorting for the by-track Relationships view. Pure — no IO, no React.
 *
 * Undated entries (`at === null`) are treated as older than every dated one,
 * matching `compareDeltas`. So "recently changed" (descending) lists them last.
 */
import type { Ledger, RelationshipDelta } from '../../../shared/relationships/model';
import type { TrackKind } from '../../../shared/relationships/spec';
import { compareDeltas } from '../../../shared/relationships/current-value';

export type SortMode = 'mine' | 'value' | 'recent' | 'alpha';

/** Sort modes offered for a kind; the first is the default. */
export function sortModesForKind(kind: TrackKind): SortMode[] {
  return kind === 'ordinal' ? ['recent', 'alpha'] : ['mine', 'value', 'recent'];
}

/** Display label: My order / By value / Recently changed / A–Z. */
export function sortLabel(mode: SortMode): string {
  switch (mode) {
    case 'mine':
      return 'My order';
    case 'value':
      return 'By value';
    case 'recent':
      return 'Recently changed';
    case 'alpha':
      return 'A–Z';
  }
}

/** The latest applied delta (`at <= now`; undated count as before all dated) and its `at`, or null when none applied. */
export function lastChange(
  ledger: Ledger,
  now: number,
): { delta: RelationshipDelta; at: number | null } | null {
  let best: RelationshipDelta | null = null;
  for (const d of ledger.deltas) {
    if (d.at !== null && d.at > now) continue;
    if (best === null || compareDeltas(d, best) > 0) best = d;
  }
  return best ? { delta: best, at: best.at } : null;
}

/** Number of history entries (deltas) in a ledger. */
export function entryCount(ledger: Ledger): number {
  return ledger.deltas.length;
}

/** What a sort needs to know about a row. `value` is the numeric value or rung index. */
export interface SortableRow {
  key: string;
  label: string;
  value: number | null;
  /** null/undefined = undated or no applied change. */
  lastAt: number | null | undefined;
}

function byLabel(a: SortableRow, b: SortableRow): number {
  return a.label.localeCompare(b.label) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

/** A–Z by label (key breaks ties). */
export function compareByLabel(a: SortableRow, b: SortableRow): number {
  return byLabel(a, b);
}

/** Value descending; rows without a value last; ties A–Z. */
export function compareByValueDesc(a: SortableRow, b: SortableRow): number {
  if (a.value === null && b.value === null) return byLabel(a, b);
  if (a.value === null) return 1;
  if (b.value === null) return -1;
  return b.value - a.value || byLabel(a, b);
}

/** Recently changed: latest `lastAt` first; undated/unchanged rows last; ties A–Z. */
export function compareByRecentDesc(a: SortableRow, b: SortableRow): number {
  const x = a.lastAt ?? null;
  const y = b.lastAt ?? null;
  if (x === null && y === null) return byLabel(a, b);
  if (x === null) return 1;
  if (y === null) return -1;
  return y - x || byLabel(a, b);
}

/** History entries ascending: undated first, then by `at`, ties by path then ordinal (same as `compareDeltas`). */
export function compareHistoryEntries(a: RelationshipDelta, b: RelationshipDelta): number {
  return compareDeltas(a, b);
}

/**
 * Sorts rows (returns a copy). `mine` is sparse and advisory: keys in
 * `orderedKeys` come first in that order, unlisted rows follow A–Z, and stale
 * keys are ignored.
 */
export function sortRows(
  rows: readonly SortableRow[],
  mode: SortMode,
  orderedKeys: readonly string[] = [],
): SortableRow[] {
  if (mode === 'value') return [...rows].sort(compareByValueDesc);
  if (mode === 'recent') return [...rows].sort(compareByRecentDesc);
  if (mode === 'alpha') return [...rows].sort(compareByLabel);

  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out: SortableRow[] = [];
  const used = new Set<string>();
  for (const key of orderedKeys) {
    const row = byKey.get(key);
    if (row && !used.has(key)) {
      out.push(row);
      used.add(key);
    }
  }
  const rest = rows.filter((r) => !used.has(r.key)).sort(compareByLabel);
  return [...out, ...rest];
}
