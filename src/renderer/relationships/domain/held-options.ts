/**
 * Pure computation of which categorical options are held — used by a Remove
 * directive's blanks so they only offer keys/notes that could actually be
 * removed. Remove is event-only (see `src/shared/relationships/AGENTS.md`),
 * so this always folds toward a specific event date.
 *
 * "Bodies are truth" (AGENTS.md): the current file's saved deltas may be
 * stale the moment the buffer has unsaved edits, so they're dropped and
 * replaced with whatever the buffer's own directives currently parse to, via
 * the shared `deltasForFile` — including mirrors from a `mutual` categorical
 * option declared earlier in the same file (e.g. `Give B relationship:
 * married -> A` mirrors onto (A, B), so a same-event Remove for A -> B sees
 * it as held).
 *
 * No IO, no React.
 */
import type {
  Ledger,
  RelationshipDelta,
  ResolvedTrack,
  TrackLibrary,
} from '../../../shared/relationships';
import {
  computeValue,
  deltasForFile,
  ledgerKey,
  splitLedgerKey,
} from '../../../shared/relationships';

/**
 * One ledger's deltas as the editor sees them: the saved deltas minus those
 * declared in `path` (the buffer is the truth for that file), plus the
 * buffer's own deltas minus the directive being edited. A `null` path (an
 * unsaved buffer) keeps every saved delta.
 */
export function deltasWithBuffer(input: {
  saved: readonly RelationshipDelta[];
  fromBuffer: readonly RelationshipDelta[];
  path: string | null;
  excludeOrdinal: number | undefined;
}): RelationshipDelta[] {
  const { saved, fromBuffer, path, excludeOrdinal } = input;
  return [
    ...saved.filter((d) => path === null || d.declaredIn.path !== path),
    ...fromBuffer.filter((d) => d.declaredIn.ordinal !== excludeOrdinal),
  ];
}

export interface HeldTagsByObserverParams {
  holder: string;
  track: ResolvedTrack;
  library: TrackLibrary;
  /** The holder's own ledgers (any track), filtered from the editor's saved-ledger snapshot. Ledgers for a different track are ignored. */
  ledgers: readonly Ledger[];
  /** The editor's current (possibly unsaved) document text. */
  doc: string;
  /** Campaign-relative path of the file being edited. */
  path: string;
  /** The declaring event's date (`null` -> the undated baseline). */
  at: number | null;
  /** Ordinal of the directive currently being edited, if any — excluded (direct and mirrored). */
  excludeOrdinal?: number;
}

/**
 * Held option keys for every (holder, *, track) ledger the holder has,
 * keyed by observer. A Remove's tag blank unions this map's values (or, once
 * the observer is filled, reads that one entry); its observer blank filters
 * observers whose list includes the chosen tag — see `unionHeldOptions` /
 * `observersHolding`.
 */
export function heldTagsByObserver(params: HeldTagsByObserverParams): Map<string, string[]> {
  const { holder, track, library, ledgers, doc, path, at, excludeOrdinal } = params;
  const trackId = track.id;
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
    const deltas = deltasWithBuffer({
      saved: saved.deltas,
      fromBuffer: bufferLedgers.get(ledgerKey(holder, observer, trackId)) ?? [],
      path,
      excludeOrdinal,
    });
    const value = computeValue({ ...saved, deltas }, track, at ?? -Infinity);
    result.set(observer, Array.isArray(value) ? value : []);
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
