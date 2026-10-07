/**
 * Sorting for the by-track Relationships view. Pure — no IO, no React.
 *
 * Undated entries (`at === null`) are treated as older than every dated one,
 * matching `compareDeltas`. So "recently changed" (descending) lists them last.
 */
import type { Ledger, RelationshipDelta } from '../../../shared/relationships/model';
import type { TrackKind } from '../../../shared/relationships/spec';
import { compareDeltas } from '../../../shared/relationships/current-value';
import type { NumericColumn } from './numeric-columns';

export type SortMode = 'mine' | 'value' | 'recent' | 'alpha';

/** A column a row list can be sorted by: the clickable column titles of a numeric tab. */
export type SortColumn = NumericColumn;
export type SortDir = 'asc' | 'desc';
export interface ColumnSort {
  column: SortColumn;
  dir: SortDir;
}

/** How rows are ordered: a named mode (`'mine'` is My order) or a column. */
export type RowSort = SortMode | ColumnSort;

/**
 * Sort modes offered as buttons for a kind; the first is the default. Numeric
 * tracks offer none: they sort by column title and default to My order.
 */
export function sortModesForKind(kind: TrackKind): SortMode[] {
  if (kind === 'numeric') return [];
  return kind === 'ordinal' ? ['recent', 'alpha'] : ['mine', 'value', 'recent'];
}

export function isColumnSort(sort: RowSort): sort is ColumnSort {
  return typeof sort === 'object';
}

/** The direction a column sorts in when first chosen: names A–Z, everything else biggest/latest first. */
function naturalDir(column: SortColumn): SortDir {
  return column === 'name' ? 'asc' : 'desc';
}

/**
 * The sort after clicking a column title: first click sorts in the column's
 * natural direction, a second flips it, a third returns to My order. Clicking
 * a different column starts at that column's natural direction.
 */
export function nextColumnSort(current: RowSort, column: SortColumn): RowSort {
  const natural = naturalDir(column);
  if (!isColumnSort(current) || current.column !== column) return { column, dir: natural };
  return current.dir === natural ? { column, dir: natural === 'asc' ? 'desc' : 'asc' } : 'mine';
}

/** The direction `column` is currently sorted in, or null when another sort is active. */
export function columnSortOf(sort: RowSort, column: SortColumn): SortDir | null {
  return isColumnSort(sort) && sort.column === column ? sort.dir : null;
}

/** The accessible name of a column title button: the title, plus the sort direction when it is the sorted column. */
export function columnTitleLabel(title: string, dir: SortDir | null): string {
  if (dir === null) return title;
  return `${title}, sorted ${dir === 'asc' ? 'ascending' : 'descending'}`;
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
  /** History entry count. */
  entries: number;
  /**
   * Index of the band the value falls in, as `bandIndexFor` gives it (below the
   * first band counts as the first; a bandless track is all band 0). null for
   * non-numeric tracks.
   */
  band: number | null;
}

function byKey(a: SortableRow, b: SortableRow): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

function byLabel(a: SortableRow, b: SortableRow): number {
  return a.label.localeCompare(b.label) || byKey(a, b);
}

/** Orders numbers in `dir`; a missing number is last in either direction. 0 when both are equal or missing. */
function compareNullsLast(
  x: number | null | undefined,
  y: number | null | undefined,
  dir: SortDir,
): number {
  const a = x ?? null;
  const b = y ?? null;
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir === 'asc' ? a - b : b - a;
}

/** A–Z by label (key breaks ties). */
export function compareByLabel(a: SortableRow, b: SortableRow): number {
  return byLabel(a, b);
}

/** Value descending; rows without a value last; ties A–Z. */
export function compareByValueDesc(a: SortableRow, b: SortableRow): number {
  return compareNullsLast(a.value, b.value, 'desc') || byLabel(a, b);
}

/** Recently changed: latest `lastAt` first; undated/unchanged rows last; ties A–Z. */
export function compareByRecentDesc(a: SortableRow, b: SortableRow): number {
  return compareNullsLast(a.lastAt, b.lastAt, 'desc') || byLabel(a, b);
}

/** Z–A by label (key breaks ties A–Z). */
function compareByLabelDesc(a: SortableRow, b: SortableRow): number {
  return b.label.localeCompare(a.label) || byKey(a, b);
}

/** Orders by a number in `dir`, a missing number last; ties A–Z. */
function byNumber(
  pick: (row: SortableRow) => number | null | undefined,
  dir: SortDir,
): (a: SortableRow, b: SortableRow) => number {
  return (a, b) => compareNullsLast(pick(a), pick(b), dir) || byLabel(a, b);
}

function byValue(dir: SortDir): (a: SortableRow, b: SortableRow) => number {
  return dir === 'desc' ? compareByValueDesc : byNumber((r) => r.value, dir);
}

/**
 * Comparator for a column sort. A row missing the sorted number (no applied
 * change, no value, no band) is last in both directions; ties fall back to
 * A–Z. Band orders by band index, then value, then name, so on a bandless
 * track (every row in band 0) it orders by value then name.
 */
export function compareByColumn({
  column,
  dir,
}: ColumnSort): (a: SortableRow, b: SortableRow) => number {
  switch (column) {
    case 'name':
      return dir === 'asc' ? compareByLabel : compareByLabelDesc;
    case 'entries':
      return byNumber((r) => r.entries, dir);
    case 'last':
      return dir === 'desc' ? compareByRecentDesc : byNumber((r) => r.lastAt, dir);
    case 'value':
      return byValue(dir);
    case 'band': {
      const tieBreak = byValue(dir);
      return (a, b) => compareNullsLast(a.band, b.band, dir) || tieBreak(a, b);
    }
  }
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
  mode: RowSort,
  orderedKeys: readonly string[] = [],
): SortableRow[] {
  if (isColumnSort(mode)) return [...rows].sort(compareByColumn(mode));
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
