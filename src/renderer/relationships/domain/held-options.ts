/**
 * Pure computation of which categorical options are held on a ledger right
 * now — used by the "remove" bubble's option picker so it only offers keys
 * that could actually be removed. Remove is event-only (see
 * `src/shared/relationships/AGENTS.md`), so this always folds toward a
 * specific event date.
 *
 * "Bodies are truth" (AGENTS.md): the deltas this file's *saved* directives
 * declared may be stale the moment the buffer has unsaved edits, so the
 * saved ledger's deltas for the current file are dropped and replaced with
 * whatever the buffer's own directives currently parse to — the directive
 * being edited (`excludeOrdinal`) excluded, since removing an option
 * requires it to be held by some *other* directive.
 *
 * No IO, no React.
 */
import type { Ledger, RelationshipDelta, TrackLibrary } from '../../../shared/relationships';
import {
  computeValue,
  parseDirectives,
  interpretDirective,
  resolveTrack,
} from '../../../shared/relationships';
import type { ResolvedTrack } from '../../../shared/relationships';

/**
 * Deltas for the (holder, observer, trackId) ledger found among `doc`'s
 * directives — re-parsed and interpreted fresh, all dated `at` (the buffer
 * has one declaring event date, not per-directive dates), and excluding the
 * directive at `excludeOrdinal`.
 */
export function deltasFromBuffer(
  doc: string,
  path: string,
  library: TrackLibrary,
  holder: string,
  observer: string,
  trackId: string,
  at: number | null,
  excludeOrdinal?: number,
): RelationshipDelta[] {
  const { directives } = parseDirectives(doc);
  const deltas: RelationshipDelta[] = [];

  for (const d of directives) {
    if (d.ordinal === excludeOrdinal) continue;

    const interpreted = interpretDirective(d, { resolveTrack: (id) => resolveTrack(id, library) });
    if (interpreted.status !== 'ok') continue;
    if (
      interpreted.holder !== holder ||
      interpreted.observer !== observer ||
      interpreted.trackId !== trackId
    ) {
      continue;
    }

    const delta: RelationshipDelta = {
      ...interpreted.op,
      at,
      declaredIn: { path, ordinal: d.ordinal },
    };
    if (interpreted.reason) delta.reason = interpreted.reason;
    deltas.push(delta);
  }

  return deltas;
}

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
 * Held options computed from `ledger`'s saved deltas *outside* the current
 * file, plus the current file's buffer as it stands right now.
 */
export function heldOptionsForBuffer(params: HeldOptionsForBufferParams): string[] {
  const { ledger, track, library, doc, path, at, excludeOrdinal } = params;
  const saved = ledger.deltas.filter((d) => d.declaredIn.path !== path);
  const fromBuffer = deltasFromBuffer(
    doc,
    path,
    library,
    ledger.holder,
    ledger.observer,
    ledger.track,
    at,
    excludeOrdinal,
  );
  return heldOptionsAt(ledger, track, at, [...saved, ...fromBuffer]);
}
