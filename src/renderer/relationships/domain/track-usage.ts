/**
 * Which notes a relationship track is used by, and how near each use is to
 * the declaring event's date — used to order or annotate the notes offered
 * for a track. A note is used when it is the holder or the observer of any
 * delta on the track, including mirrored deltas (which sit on the swapped
 * ledger, so counting both sides covers them).
 *
 * The editor buffer is the truth for its own file, so the saved deltas for
 * that file are replaced with the buffer's, as in `held-options.ts`.
 *
 * Pure — no IO, no React.
 */
import type { Ledger, RelationshipDelta, TrackLibrary } from '../../../shared/relationships';
import { deltasForFile, ledgerKey, splitLedgerKey } from '../../../shared/relationships';
import { deltasWithBuffer } from './held-options';

export interface TrackUsageInput {
  /** All saved ledgers from the relationship index; other tracks are ignored. */
  ledgers: readonly Ledger[];
  /** Custom tracks are resolved through this library, as in `held-options.ts`. */
  library: TrackLibrary;
  trackId: string;
  /** The file being edited, or `null` when the buffer is unsaved. */
  path: string | null;
  /** The editor buffer's full text. */
  doc: string;
  /** True for event buffers, false for notes. */
  isEvent: boolean;
  /** The declaring event's date in epoch seconds; `null` in a note or an undated event. */
  at: number | null;
  /** Ordinal of the directive being edited — excluded from the buffer's deltas. */
  excludeOrdinal: number | undefined;
}

/**
 * Note id -> proximity in seconds for every note used on the track. The
 * proximity is the smallest `|at - delta.at|` over the note's deltas, or
 * `null` when `at` is null or none of the note's deltas is dated.
 */
export function trackUsageProximity(input: TrackUsageInput): Map<string, number | null> {
  const { ledgers, library, trackId, path, doc, isEvent, at, excludeOrdinal } = input;
  const { ledgers: bufferLedgers } = deltasForFile(
    { path: path ?? '', source: doc, isEvent, epochSeconds: at },
    { library },
  );

  const savedByKey = new Map<string, RelationshipDelta[]>();
  for (const l of ledgers) {
    if (l.track !== trackId) continue;
    savedByKey.set(ledgerKey(l.holder, l.observer, l.track), l.deltas);
  }
  const keys = new Set(savedByKey.keys());
  for (const key of bufferLedgers.keys()) {
    if (splitLedgerKey(key).track === trackId) keys.add(key);
  }

  const proximity = new Map<string, number | null>();
  for (const key of keys) {
    const { holder, observer } = splitLedgerKey(key);
    const deltas = deltasWithBuffer({
      saved: savedByKey.get(key) ?? [],
      fromBuffer: bufferLedgers.get(key) ?? [],
      path,
      excludeOrdinal,
    });
    for (const delta of deltas) {
      const distance = at === null || delta.at === null ? null : Math.abs(at - delta.at);
      for (const note of [holder, observer]) {
        const prev = proximity.get(note);
        proximity.set(note, prev === undefined ? distance : nearer(prev, distance));
      }
    }
  }
  return proximity;
}

/** The smaller of two proximities, where `null` (no distance) yields to a number. */
function nearer(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}
