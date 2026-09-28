/**
 * Pure detection of "more than one undated Set for the same relationship" —
 * the one rule that makes an otherwise-valid note directive an error: notes
 * are undated, so a relationship (track + holder + observer) may be Set by
 * at most one note directive, whether that's two directives in the same
 * note or one each in two different notes (see AGENTS.md's notes-vs-events
 * invariant). Shared by the main-process store (across every saved file's
 * ledger) and the editor's buffer-side check (same-buffer duplicates,
 * instantly, before a save, plus cross-file conflicts pushed in from main).
 *
 * Pure — no IO. Dated Sets and events never conflict; callers are
 * responsible for only handing this undated Sets.
 */

import { ledgerKey } from './derive-file-deltas.js';

export interface UndatedSetKey {
  holder: string;
  observer: string;
  trackId: string;
}

/** The identity two undated Sets must share to conflict: same holder, observer and track. */
export function undatedSetGroupKey(k: UndatedSetKey): string {
  return ledgerKey(k.holder, k.observer, k.trackId);
}

/**
 * Groups items by `undatedSetGroupKey`, keeping only groups of two or more —
 * the ones that conflict. Used both when the items already share one key
 * (a single ledger's undated Sets) and when they don't (a whole file or
 * buffer's undated Sets).
 */
export function conflictingGroups<T extends UndatedSetKey>(items: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = undatedSetGroupKey(item);
    const arr = groups.get(key);
    if (arr) arr.push(item);
    else groups.set(key, [item]);
  }
  for (const [key, arr] of groups) {
    if (arr.length <= 1) groups.delete(key);
  }
  return groups;
}

/** One undated Set directive in the buffer currently being edited, identified by its directive ordinal. */
export interface BufferUndatedSet extends UndatedSetKey {
  ordinal: number;
}

/** One undated Set declared in another saved file. */
export interface ExternalUndatedSet extends UndatedSetKey {
  /** Campaign-relative path of the note it's declared in. */
  path: string;
}

export interface SetConflict {
  ordinal: number;
  /** Another Set in this same buffer targets the same relationship. */
  duplicateInBuffer: boolean;
  /** Paths of other saved files that also Set this relationship (deduped). */
  externalPaths: string[];
}

/**
 * For each of this buffer's undated Set directives, reports whether it
 * conflicts with another Set in the same buffer, or with an undated Set
 * declared in another saved file. `external` must already exclude this
 * buffer's own saved path — the buffer is the source of truth for that
 * file, not whatever main last derived from disk. Returns only the
 * directives that DO conflict.
 */
export function findSetConflicts(
  buffer: readonly BufferUndatedSet[],
  external: readonly ExternalUndatedSet[] = [],
): SetConflict[] {
  const bufferGroups = new Map<string, number[]>();
  for (const item of buffer) {
    const key = undatedSetGroupKey(item);
    const arr = bufferGroups.get(key);
    if (arr) arr.push(item.ordinal);
    else bufferGroups.set(key, [item.ordinal]);
  }

  const externalByKey = new Map<string, Set<string>>();
  for (const item of external) {
    const key = undatedSetGroupKey(item);
    const set = externalByKey.get(key);
    if (set) set.add(item.path);
    else externalByKey.set(key, new Set([item.path]));
  }

  const out: SetConflict[] = [];
  for (const item of buffer) {
    const key = undatedSetGroupKey(item);
    const duplicateInBuffer = (bufferGroups.get(key)?.length ?? 0) > 1;
    const externalPaths = [...(externalByKey.get(key) ?? [])];
    if (duplicateInBuffer || externalPaths.length > 0) {
      out.push({ ordinal: item.ordinal, duplicateInBuffer, externalPaths });
    }
  }
  return out;
}

const BASE_MESSAGE = 'Only one note may set this relationship';

/**
 * Builds the hover message for one conflict. `titleFor` resolves a path to
 * a display title (falls back to the raw path when unknown).
 */
export function setConflictMessage(
  conflict: Pick<SetConflict, 'duplicateInBuffer' | 'externalPaths'>,
  titleFor: (path: string) => string | undefined,
): string {
  const parts: string[] = [BASE_MESSAGE];
  if (conflict.externalPaths.length > 0) {
    const names = conflict.externalPaths.map((p) => titleFor(p) ?? p);
    parts.push(`also set in ${names.join(', ')}`);
  }
  if (conflict.duplicateInBuffer) parts.push('set more than once in this note');
  return parts.join('; ');
}
