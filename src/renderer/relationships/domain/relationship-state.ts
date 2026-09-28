/**
 * Per-row display state: the current formatted value plus flags a renderer
 * needs to fade or flag a row (only-future deltas, an unresolvable track).
 */

import type { TrackValue } from '../../../shared/relationships/model';
import { computeValue } from '../../../shared/relationships/current-value';
import type { TrackRow } from './group-relationships';

export interface TrackRowState {
  value: TrackValue | null;
  formatted: string;
  /** Every delta on this ledger is dated in the future relative to `now`. */
  onlyFuture: boolean;
  /** `row.track` failed to resolve — the row can't be rendered normally. */
  unknownTrack: boolean;
}

export function describeTrackRow(row: TrackRow, now: number): TrackRowState {
  const { track } = row;
  if (!track) {
    return { value: null, formatted: '', onlyFuture: false, unknownTrack: true };
  }

  const deltas = row.ledger.deltas;
  const onlyFuture = deltas.length > 0 && deltas.every((d) => d.at !== null && d.at > now);

  const value = onlyFuture ? track.clamp(track.initial) : computeValue(row.ledger, track, now);

  return {
    value,
    formatted: track.format(value),
    onlyFuture,
    unknownTrack: false,
  };
}
