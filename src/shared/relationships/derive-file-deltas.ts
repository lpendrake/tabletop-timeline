/**
 * One shared per-file derivation of relationship deltas from `{{track.action
 * …}}` directives: parses a file's body, interprets each directive against a
 * track library, and folds in mirrors for `mutual` categorical options.
 *
 * Pure — no IO, no Electron, no store state. `RelationshipsStore.applyFile`
 * wires this into its cross-file concerns (reverse indexes, known-note
 * bookkeeping, the more-than-one-undated-Set check); the renderer's Remove
 * picker uses it directly to know what a file currently contributes.
 */

import { TrackLibrary } from './registry.js';
import { RelationshipDelta } from './model.js';
import { resolveTrack } from './registry.js';
import { interpretDirective, noteIdOf, parseDirectives, roleValue } from './directives/index.js';
import type { ParsedDirective } from './directives/index.js';
import type { InvalidDirectiveEntry } from './ipc-types.js';

const KEY_SEP = '::';

/** Builds a ledger's identity key from its (holder, observer, track) triple. */
export function ledgerKey(holder: string, observer: string, track: string): string {
  return `${holder}${KEY_SEP}${observer}${KEY_SEP}${track}`;
}

export interface LedgerKeyTriple {
  holder: string;
  observer: string;
  track: string;
}

/** Inverse of `ledgerKey`. */
export function splitLedgerKey(key: string): LedgerKeyTriple {
  const [holder, observer, track] = key.split(KEY_SEP);
  return { holder, observer, track };
}

/** One file's directive-bearing content, as handed to `deltasForFile`. */
export interface FileToInterpret {
  /** Campaign-relative path with forward slashes, e.g. "timeline/battle-of-dawn.md". */
  path: string;
  /** The markdown body directives are parsed from. */
  source: string;
  isEvent: boolean;
  /** For an event: its epochSeconds, or null/undefined when the event has no date. Ignored for notes. */
  epochSeconds?: number | null;
}

export interface DeriveFileDeltasContext {
  library: TrackLibrary;
  isKnownNote?: (id: string) => boolean;
}

export interface FileDeltas {
  /** Every directive this file's body parsed to, well-formed or not (for display/round-trip). */
  directives: ParsedDirective[];
  /** Deltas this file contributes, keyed by ledgerKey — direct and mirrored, mirrored flagged via `delta.mirrored`. */
  ledgers: Map<string, RelationshipDelta[]>;
  /** Raw parse errors and interpreted-invalid directives, in document order. */
  invalid: InvalidDirectiveEntry[];
  /** Every note id referenced by a holder/observer role, valid or not — used to know when to re-derive a file. */
  referencedNoteIds: Set<string>;
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

/**
 * Parses and interprets one file's directives: the deltas (direct and
 * mirrored) it contributes, its invalid entries, and the note ids its
 * directives reference. Bodies are truth — this recomputes from source every
 * call rather than patching prior state.
 */
export function deltasForFile(file: FileToInterpret, ctx: DeriveFileDeltasContext): FileDeltas {
  const { path, source, isEvent, epochSeconds } = file;
  const { library, isKnownNote } = ctx;

  const { directives, errors } = parseDirectives(source);

  const invalid: InvalidDirectiveEntry[] = errors.map((e) => ({
    path,
    from: e.from,
    to: e.to,
    messages: [e.message],
  }));

  const ledgers = new Map<string, RelationshipDelta[]>();
  const referencedNoteIds = new Set<string>();
  const noDate = isEvent && (epochSeconds === null || epochSeconds === undefined);

  for (const d of directives) {
    // Track every note referenced by a holder/observer role — regardless of
    // whether the directive is otherwise valid — so a later change to that
    // note's known-ness (created/deleted) knows to re-derive this file.
    for (const role of ['holder', 'observer'] as const) {
      const raw = roleValue(d, role);
      if (raw === undefined) continue;
      const noteId = noteIdOf(raw);
      if (noteId !== null) referencedNoteIds.add(noteId);
    }

    if (noDate) {
      invalid.push({
        path,
        ordinal: d.ordinal,
        from: d.from,
        to: d.to,
        messages: ['Event has no date'],
      });
      continue;
    }

    const at = isEvent ? (epochSeconds as number) : null;
    const interpreted = interpretDirective(d, {
      resolveTrack: (id) => resolveTrack(id, library),
      isKnownNote,
      // Notes have no order — Change/Shift/Remove are event-only. See
      // src/shared/relationships/AGENTS.md.
      undated: !isEvent,
    });

    if (interpreted.status === 'unfinished') continue;

    if (interpreted.status === 'invalid') {
      invalid.push({
        path,
        ordinal: d.ordinal,
        from: d.from,
        to: d.to,
        messages: interpreted.problems.map((p) => p.message),
      });
      continue;
    }

    const { holder, observer, trackId, op, reason } = interpreted;
    const delta: RelationshipDelta = { ...op, at, declaredIn: { path, ordinal: d.ordinal } };
    if (reason) delta.reason = reason;
    const key = ledgerKey(holder, observer, trackId);
    pushTo(ledgers, key, delta);

    const track = resolveTrack(trackId, library);
    if (track && track.kind === 'categorical' && (op.op === 'add' || op.op === 'remove')) {
      const optSpec = track.optionFor(op.key);
      if (optSpec?.mutual) {
        const mirrorKey = ledgerKey(observer, holder, trackId);
        const mirrorDelta: RelationshipDelta = {
          ...op,
          at,
          declaredIn: { path, ordinal: d.ordinal },
          mirrored: true,
        };
        if (reason) mirrorDelta.reason = reason;
        pushTo(ledgers, mirrorKey, mirrorDelta);
      }
    }
  }

  return { directives, ledgers, invalid, referencedNoteIds };
}
