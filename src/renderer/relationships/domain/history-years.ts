/**
 * History entries grouped by in-game year, with each year's open state. Generic
 * across track kinds. Pure — no IO, no React.
 */
import type { TrackValue } from '../../../shared/relationships';
import type { HistoryEntry } from './view-rows';

export const UNDATED_YEAR_KEY = 'undated';
export const UNDATED_YEAR_LABEL = 'Undated notes';

/** The in-game year containing an epoch-seconds instant. */
export type YearOf = (at: number) => number;

export interface HistoryYear {
  /** `String(year)`, or `UNDATED_YEAR_KEY`. */
  key: string;
  year: number | null;
  /** Newest first. */
  entries: HistoryEntry[];
  /** The oldest entry's previous value. */
  from: TrackValue;
  /** The newest entry's running value. */
  to: TrackValue;
  count: number;
  /** Every entry is still ahead of the as-of date; never true for undated. */
  allFuture: boolean;
  /** Entries that are search hits. */
  hits: number;
  defaultOpen: boolean;
}

/**
 * The year the as-of date falls in, but no later than the newest dated year, so
 * a date past every entry still opens the newest. With an unbounded `now`, the
 * newest dated year. Null when the history has no dated entries.
 */
export function currentYear(
  history: readonly HistoryEntry[],
  now: number,
  yearOf: YearOf,
): number | null {
  const years = history.flatMap((entry) => (entry.at === null ? [] : [yearOf(entry.at)]));
  if (years.length === 0) return null;
  const newest = Math.max(...years);
  return Number.isFinite(now) ? Math.min(yearOf(now), newest) : newest;
}

function buildYear(
  key: string,
  year: number | null,
  chronological: HistoryEntry[],
  defaultOpen: boolean,
): HistoryYear {
  const entries = chronological.reverse();
  return {
    key,
    year,
    entries,
    from: entries[entries.length - 1].previousValue,
    to: entries[0].runningValue,
    count: entries.length,
    allFuture: year !== null && entries.every((e) => !e.applied),
    hits: entries.filter((e) => e.hit === true).length,
    defaultOpen,
  };
}

/**
 * Dated years newest first, then the undated group. `history` is chronological
 * with undated entries first, as `buildHistory` produces it.
 */
export function groupHistoryByYear(
  history: readonly HistoryEntry[],
  now: number,
  yearOf: YearOf,
): HistoryYear[] {
  const undated: HistoryEntry[] = [];
  const dated = new Map<number, HistoryEntry[]>();
  for (const entry of history) {
    if (entry.at === null) {
      undated.push(entry);
      continue;
    }
    const year = yearOf(entry.at);
    const list = dated.get(year);
    if (list) list.push(entry);
    else dated.set(year, [entry]);
  }

  const current = currentYear(history, now, yearOf);
  const years = [...dated]
    .sort(([a], [b]) => b - a)
    .map(([year, list]) =>
      buildYear(String(year), year, list, current !== null && year >= current),
    );
  if (undated.length > 0) {
    years.push(buildYear(UNDATED_YEAR_KEY, null, undated, years.length === 0));
  }
  return years;
}

export function yearLabel(year: Pick<HistoryYear, 'year'>): string {
  return year.year === null ? UNDATED_YEAR_LABEL : String(year.year);
}

/** `3 entries`, plus ` · scheduled` when every entry is still ahead. */
export function yearCountLabel(year: Pick<HistoryYear, 'count' | 'allFuture'>): string {
  const base = `${year.count} ${year.count === 1 ? 'entry' : 'entries'}`;
  return year.allFuture ? `${base} · scheduled` : base;
}

/** `· 2 matches`; null when the year has no search hits. */
export function yearMatchLabel(year: Pick<HistoryYear, 'hits'>): string | null {
  if (year.hits === 0) return null;
  return `· ${year.hits} ${year.hits === 1 ? 'match' : 'matches'}`;
}

/** An explicit toggle wins; otherwise a year opens when it has search hits or is open by default. */
export function isYearOpen(
  year: Pick<HistoryYear, 'key' | 'hits' | 'defaultOpen'>,
  overrides: ReadonlyMap<string, boolean>,
): boolean {
  return overrides.get(year.key) ?? (year.hits > 0 || year.defaultOpen);
}

export function withToggledYear(
  overrides: ReadonlyMap<string, boolean>,
  year: Pick<HistoryYear, 'key' | 'hits' | 'defaultOpen'>,
): ReadonlyMap<string, boolean> {
  return new Map(overrides).set(year.key, !isYearOpen(year, overrides));
}
