/**
 * Pure computation of which categorical options are held — used by the
 * "remove" bubble's blanks so they only offer keys/notes that could
 * actually be removed. Remove is event-only (see
 * `src/shared/relationships/AGENTS.md`), so this always folds toward a
 * specific event date.
 *
 * "Bodies are truth" (AGENTS.md): the deltas the current file's *saved*
 * directives declared may be stale the moment the buffer has unsaved
 * edits, so the saved ledger's deltas for the current file are dropped and
 * replaced with whatever the buffer's own directives currently parse to.
 *
 * The buffer side goes through the shared `deltasForFile` — the same
 * derivation `RelationshipsStore` uses — rather than re-parsing directives
 * ad hoc, so mirrored deltas from a `mutual` categorical option declared
 * earlier in the *same* file are folded in too. A buggy prior version
 * re-derived the buffer's deltas without mirrors: an event with
 * `Give B relationship: married → A` (married is Symmetrical/mutual)
 * followed by a Remove for A → B offered nothing, because the mirror onto
 * (A, B) only existed in the saved store, not in this file's own
 * derivation of itself.
 *
 * No IO, no React.
 */
import type { Ledger, RelationshipDelta, TrackLibrary } from '../../../shared/relationships';
import {
  computeValue,
  deltasForFile,
  ledgerKey,
  splitLedgerKey,
} from '../../../shared/relationships';
import type { ResolvedTrack } from '../../../shared/relationships';

/** Option keys `deltas` fold to on `ledger` as of `at` (`null` -> `-Infinity`, the undated baseline). */
export function heldOptionsAt(
  ledger: Ledger,
  track: ResolvedTrack,
  at: number | null,
  deltas: readonly RelationshipDelta[],
): string[] {
  const value = computeValue({ ...ledger, deltas: [...deltas] }, track, at ?? -Infinity);
  return Array.isArray(value) ? value : [];
}

/**
 * Folds one (holder, observer, track) ledger: `ledger`'s saved deltas
 * outside `path`, plus `path`'s own deltas as re-derived by
 * `deltasForFile` (direct and mirrored), minus any delta declared by the
 * directive at `excludeOrdinal` (also direct and mirrored — they share the
 * same `declaredIn.ordinal` as the directive that produced them).
 */
function foldLedger(
  ledger: Ledger,
  track: ResolvedTrack,
  at: number | null,
  bufferLedgers: Map<string, RelationshipDelta[]>,
  path: string,
  excludeOrdinal?: number,
): string[] {
  const key = ledgerKey(ledger.holder, ledger.observer, ledger.track);
  const saved = ledger.deltas.filter((d) => d.declaredIn.path !== path);
  const fromBuffer = (bufferLedgers.get(key) ?? []).filter(
    (d) => d.declaredIn.ordinal !== excludeOrdinal,
  );
  return heldOptionsAt(ledger, track, at, [...saved, ...fromBuffer]);
}

export interface HeldOptionsForBufferParams {
  ledger: Ledger;
  track: ResolvedTrack;
  library: TrackLibrary;
  /** The editor's current (possibly unsaved) document text. */
  doc: string;
  /** Campaign-relative path of the file being edited. */
  path: string;
  /** The declaring event's date. */
  at: number | null;
  /** Ordinal of the directive currently being edited, if any. */
  excludeOrdinal?: number;
}

/**
 * Held options for one specific (holder, observer) ledger, computed from
 * its saved deltas *outside* the current file, plus the current file's
 * buffer as it stands right now. Used when the observer is already known —
 * the normal in-order Remove fill (tag, then observer) reaches this once
 * the observer blank is filled, and the out-of-order case (observer typed
 * or picked before the tag) reaches it as soon as it opens the tag blank.
 */
export function heldOptionsForBuffer(params: HeldOptionsForBufferParams): string[] {
  const { ledger, track, library, doc, path, at, excludeOrdinal } = params;
  const { ledgers: bufferLedgers } = deltasForFile(
    { path, source: doc, isEvent: true, epochSeconds: at },
    { library },
  );
  return foldLedger(ledger, track, at, bufferLedgers, path, excludeOrdinal);
}

export interface HeldOptionsByObserverParams {
  holder: string;
  trackId: string;
  track: ResolvedTrack;
  library: TrackLibrary;
  /** The holder's own ledgers (any track) — e.g. from `relationshipsData.getLedgers(holder, 'holder')`. Ledgers for a different track are ignored. */
  ledgers: readonly Ledger[];
  doc: string;
  path: string;
  at: number | null;
  excludeOrdinal?: number;
}

/**
 * Held option keys for every (holder, *, trackId) ledger, keyed by
 * observer — the tag-first Remove step (before an observer is chosen)
 * folds every observer the holder has *any* history with on this track,
 * union'd; the observer step filters this same per-observer breakdown down
 * to just the ones holding a particular tag. The observer universe is
 * every observer already known from `ledgers` plus any observer the
 * buffer itself declares for this (holder, trackId) with no saved ledger
 * yet (e.g. an unsaved directive earlier in the same file).
 */
export function heldOptionsByObserver(params: HeldOptionsByObserverParams): Map<string, string[]> {
  const { holder, trackId, track, library, ledgers, doc, path, at, excludeOrdinal } = params;
  const { ledgers: bufferLedgers } = deltasForFile(
    { path, source: doc, isEvent: true, epochSeconds: at },
    { library },
  );

  const observers = new Set<string>();
  for (const l of ledgers) {
    if (l.holder === holder && l.track === trackId) observers.add(l.observer);
  }
  for (const key of bufferLedgers.keys()) {
    const triple = splitLedgerKey(key);
    if (triple.holder === holder && triple.track === trackId) observers.add(triple.observer);
  }

  const result = new Map<string, string[]>();
  for (const observer of observers) {
    const saved: Ledger = ledgers.find(
      (l) => l.holder === holder && l.observer === observer && l.track === trackId,
    ) ?? { holder, observer, track: trackId, deltas: [] };
    result.set(observer, foldLedger(saved, track, at, bufferLedgers, path, excludeOrdinal));
  }
  return result;
}

/** Union of held option keys across every observer in `byObserver` — the tag-first Remove step's query. */
export function unionHeldOptions(byObserver: ReadonlyMap<string, string[]>): string[] {
  const keys = new Set<string>();
  for (const held of byObserver.values()) {
    for (const key of held) keys.add(key);
  }
  return [...keys];
}

/** Observer ids (from `byObserver`) whose held options include `option` — the observer step's query. */
export function observersHolding(
  byObserver: ReadonlyMap<string, string[]>,
  option: string,
): string[] {
  const ids: string[] = [];
  for (const [observer, held] of byObserver) {
    if (held.includes(option)) ids.push(observer);
  }
  return ids;
}
