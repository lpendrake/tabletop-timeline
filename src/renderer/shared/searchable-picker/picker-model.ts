/**
 * Pure ranking/ordering logic for the searchable picker. No React, no DOM —
 * see `searchable-picker.tsx` for the component that wires this up to UI
 * state.
 */
import { matchPath } from '../search/path-match';
import { compareRanked, matchRanges, type MatchRank } from '../search/rank';
import { wrapIndex } from '../search/wrap-index';

export interface PickerOption {
  id: string;
  path: string;
  /** Display text; defaults to `path` when omitted. */
  label?: string;
  /** Optional count, shown muted on the right of the row. */
  count?: number;
}

export interface PickerGroup {
  key: 'pinned' | 'all';
  /** Header text; omitted when the picker has no pinned group (flat list). */
  label?: string;
  options: PickerOption[];
}

export interface GroupPickerConfig {
  pinned?: readonly PickerOption[];
  recentIds?: readonly string[];
  /** Caps the number of options in the All group. */
  limit?: number;
  pinnedLabel?: string;
  allLabel?: string;
}

/** One navigable row: `index` is its position in the flat list across groups. */
export interface FlatPickerEntry {
  index: number;
  groupKey: PickerGroup['key'];
  groupIndex: number;
  optionIndex: number;
  option: PickerOption;
}

export interface HighlightSegment {
  text: string;
  match: boolean;
}

/**
 * Groups options for display. Without `pinned` this is a single unlabelled
 * `all` group identical to `rankPickerOptions`. With `pinned`, a Pinned group
 * (given order when the query is empty, ranked when searching) precedes the
 * All group. Empty groups are dropped. An option may appear in both groups;
 * use `flattenGroups` so each appearance has its own flat index.
 */
export function groupPickerOptions(
  options: readonly PickerOption[],
  query: string,
  config: GroupPickerConfig = {},
): PickerGroup[] {
  const { pinned, recentIds, limit, pinnedLabel = 'Pinned', allLabel = 'All' } = config;
  const all = rankPickerOptions(options, query, recentIds, limit);
  if (!pinned) return all.length ? [{ key: 'all', options: all }] : [];
  const pinnedResult = rankPickerOptions(pinned, query);
  const groups: PickerGroup[] = [];
  if (pinnedResult.length)
    groups.push({ key: 'pinned', label: pinnedLabel, options: pinnedResult });
  if (all.length) groups.push({ key: 'all', label: allLabel, options: all });
  return groups;
}

/** Flattens groups into the navigable list (headers excluded). */
export function flattenGroups(groups: readonly PickerGroup[]): FlatPickerEntry[] {
  const flat: FlatPickerEntry[] = [];
  groups.forEach((group, groupIndex) => {
    group.options.forEach((option, optionIndex) => {
      flat.push({ index: flat.length, groupKey: group.key, groupIndex, optionIndex, option });
    });
  });
  return flat;
}

/** Flat index of `(groupIndex, optionIndex)`, or -1 if out of range. */
export function flatIndexOf(
  groups: readonly PickerGroup[],
  groupIndex: number,
  optionIndex: number,
): number {
  if (!groups[groupIndex]?.options[optionIndex]) return -1;
  let index = optionIndex;
  for (let g = 0; g < groupIndex; g++) index += groups[g].options.length;
  return index;
}

/** Splits `text` into matched / unmatched segments for the trimmed `query`. */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const [start, end] of matchRanges(text, query)) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), match: false });
    segments.push({ text: text.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < text.length || segments.length === 0) {
    segments.push({ text: text.slice(cursor), match: false });
  }
  return segments;
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
