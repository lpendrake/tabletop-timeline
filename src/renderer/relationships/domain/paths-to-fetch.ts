/**
 * Which declaring-file paths need their directives fetched, for the currently
 * expanded track rows only — never for a collapsed row. This is what keeps
 * step computation and directive fetching scoped to what's on screen.
 */

import { currentValue } from '../../../shared/relationships/current-value';
import type { OuterRow, TrackRow } from './group-relationships';

export function pathsNeededForExpandedTracks(
  rows: OuterRow[],
  isExpanded: (row: TrackRow) => boolean,
  now: number,
): string[] {
  const paths = new Set<string>();
  for (const outer of rows) {
    for (const inner of outer.children) {
      for (const row of inner.tracks) {
        if (!row.track || !isExpanded(row)) continue;
        const { steps } = currentValue(row.ledger, row.track, now, { withSteps: true });
        for (const step of steps) paths.add(step.delta.declaredIn.path);
      }
    }
  }
  return Array.from(paths);
}
