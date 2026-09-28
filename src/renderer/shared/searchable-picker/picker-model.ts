/**
 * Pure ranking/ordering logic for the searchable picker. No React, no DOM —
 * see `searchable-picker.tsx` for the component that wires this up to UI
 * state.
 */
import { matchPath } from '../search/path-match';
import { compareRanked, type MatchRank } from '../search/rank';
import { wrapIndex } from '../search/wrap-index';

export interface PickerOption {
  id: string;
  path: string;
  /** Display text; defaults to `path` when omitted. */
  label?: string;
}

/**
 * Ranks `options` against `query`.
 *
 * - Empty (or whitespace-only) query: options whose id appears in
 *   `recentIds` come first, in `recentIds` order (ids with no matching
 *   option are ignored), followed by the remaining options in their
 *   original input order. Recents never reorder a non-empty search.
 * - Non-empty query: only options whose `path` matches `query` (via
 *   `matchPath`) are kept, sorted by match rank then input order (ties keep
 *   input order).
 *
 * `limit`, when given, caps the number of returned options.
 */
export function rankPickerOptions(
  options: readonly PickerOption[],
  query: string,
  recentIds?: readonly string[],
  limit?: number,
): PickerOption[] {
  const q = query.trim();
  const result = q ? searchOptions(options, q) : recentsFirst(options, recentIds);
  return limit !== undefined ? result.slice(0, limit) : result;
}

/**
 * Options whose id is in `recentIds` first (in `recentIds` order), then the
 * rest in their original input order. Exported so a caller with its own
 * `rank` (e.g. `NotePickerField`'s note-title ranker) can reuse the same
 * empty-query behaviour instead of reimplementing it.
 */
export function recentsFirst(
  options: readonly PickerOption[],
  recentIds?: readonly string[],
): PickerOption[] {
  const byId = new Map(options.map((option) => [option.id, option]));
  const recents: PickerOption[] = [];
  const seen = new Set<string>();
  for (const id of recentIds ?? []) {
    const option = byId.get(id);
    if (option && !seen.has(id)) {
      recents.push(option);
      seen.add(id);
    }
  }
  const rest = options.filter((option) => !seen.has(option.id));
  return [...recents, ...rest];
}

interface RankedOption {
  option: PickerOption;
  index: number;
  rank: MatchRank;
}

function searchOptions(options: readonly PickerOption[], query: string): PickerOption[] {
  const ranked: RankedOption[] = [];
  options.forEach((option, index) => {
    const rank = matchPath(option.path, query);
    if (rank !== null) ranked.push({ option, index, rank });
  });
  ranked.sort(compareRanked);
  return ranked.map((entry) => entry.option);
}

/** Moves a highlighted index by `delta`, wrapping around `count` items. */
export function moveHighlight(index: number, count: number, delta: 1 | -1): number {
  return wrapIndex(index, delta, count);
}
