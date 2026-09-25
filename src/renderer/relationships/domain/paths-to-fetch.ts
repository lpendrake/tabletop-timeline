/**
 * Which declaring-file paths need their directives fetched, for the currently
 * expanded track rows only. Steps are computed via the shared `ValueCache`
 * (so a row that was already expanded doesn't re-fold its deltas), but never
 * for a collapsed row — this is what keeps step computation and directive
 * fetching scoped to what's on screen.
 */

import type { OuterRow, TrackRow } from './group-relationships';
import type { ValueCache } from './value-cache';

export function pathsNeededForExpandedTracks(
  rows: OuterRow[],
  isExpanded: (row: TrackRow) => boolean,
  now: number,
  cache: ValueCache,
): string[] {
  const paths = new Set<string>();
  for (const outer of rows) {
    for (const inner of outer.children) {
      for (const row of inner.tracks) {
        if (!row.track || !isExpanded(row)) continue;
        const steps = cache.stepsOf(row.ledger, row.track, now);
        for (const step of steps) paths.add(step.delta.declaredIn.path);
      }
    }
  }
  return Array.from(paths);
}
