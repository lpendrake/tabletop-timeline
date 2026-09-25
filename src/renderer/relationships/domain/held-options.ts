/**
 * Pure computation of which categorical options are held on a ledger as of
 * a point in in-game time — used by the "remove" bubble's option picker so
 * it only offers keys that could actually be removed at that point.
 *
 * No IO, no React.
 */
import type { Ledger, RelationshipDelta } from '../../../shared/relationships';
import { compareDeltas, applyDelta } from '../../../shared/relationships';
import type { ResolvedTrack } from '../../../shared/relationships';

export interface HeldOptionsExclude {
  path: string;
  ordinal: number;
}

function isExcluded(delta: RelationshipDelta, exclude: HeldOptionsExclude | undefined): boolean {
  if (!exclude) return false;
  return delta.declaredIn.path === exclude.path && delta.declaredIn.ordinal === exclude.ordinal;
}

/**
 * Option keys held on `ledger` as of `at`: for an event (`at` a number),
 * undated deltas plus dated deltas up to and including `at`; for a note
 * (`at === null`), only the undated baseline. The directive being edited
 * (`exclude`) is left out of the fold either way.
 */
export function heldOptionsAt(
  ledger: Ledger,
  track: ResolvedTrack,
  at: number | null,
  exclude?: HeldOptionsExclude,
): string[] {
  const deltas = ledger.deltas.filter((d) => {
    if (isExcluded(d, exclude)) return false;
    if (at === null) return d.at === null;
    return d.at === null || d.at <= at;
  });

  const sorted = [...deltas].sort(compareDeltas);

  let value = track.clamp(track.initial);
  for (const delta of sorted) {
    value = applyDelta(value, delta, track);
  }

  return Array.isArray(value) ? value : [];
}
