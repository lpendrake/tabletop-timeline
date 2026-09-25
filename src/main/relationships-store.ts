/**
 * In-memory index of relationship deltas derived from directives written in
 * note and event bodies. No Electron imports and no direct filesystem access
 * here — callers (relationships-index.ts, fileWatcher.ts, the IPC handlers)
 * read files and hand this store plain data.
 *
 * Bodies are truth; this store is a cache, entirely reconstructible by
 * re-deriving every file. See src/shared/relationships/AGENTS.md for the
 * underlying parsing/interpretation/value rules this store wires together.
 */

import type { CategoricalTrackSpec } from '../shared/relationships/index.js';
import type {
  DeltaOp,
  Ledger,
  RelationshipDelta,
  TrackLibrary,
} from '../shared/relationships/index.js';
import type { ParsedDirective } from '../shared/relationships/index.js';
import {
  interpretDirective,
  parseDirectives,
  resolveTrack,
} from '../shared/relationships/index.js';

/** One file's directive-bearing content, as handed to the store by its caller. */
export interface RelationshipFileInput {
  /** Campaign-relative path with forward slashes, e.g. "timeline/battle-of-dawn.md". */
  path: string;
  /** The markdown body directives are parsed from. */
  source: string;
  /** Display title, used only for directivesIn(). */
  title?: string;
  isEvent: boolean;
  /** For an event: its epochSeconds, or null/undefined when the event has no date. Ignored for notes. */
  epochSeconds?: number | null;
}

export interface InvalidDirectiveEntry {
  path: string;
  /** Absent for a raw parse error, which isn't associated with a well-formed directive. */
  ordinal?: number;
  from: number;
  to: number;
  messages: string[];
}

export interface LedgerKeyTriple {
  holder: string;
  observer: string;
  track: string;
}

export interface StoreChangeResult {
  touched: LedgerKeyTriple[];
}

export type LedgersAs = 'holder' | 'observer' | 'both';

const EMPTY_LIBRARY: TrackLibrary = { custom: [], optionAdditions: {} };
const KEY_SEP = '::';

function ledgerKey(holder: string, observer: string, track: string): string {
  return `${holder}${KEY_SEP}${observer}${KEY_SEP}${track}`;
}

function splitKey(key: string): LedgerKeyTriple {
  const [holder, observer, track] = key.split(KEY_SEP);
  return { holder, observer, track };
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

interface ParsedRecord {
  title?: string;
  directives: ParsedDirective[];
}

export class RelationshipsStore {
  private library: TrackLibrary = EMPTY_LIBRARY;
  private knownNoteIds = new Set<string>();
  private fileInputs = new Map<string, RelationshipFileInput>();
  private ledgerObjects = new Map<string, Ledger>();
  private invalidEntries = new Map<string, InvalidDirectiveEntry[]>();
  private parsedByPath = new Map<string, ParsedRecord>();
  /** path -> set of ledger keys that path currently contributes deltas to (direct or mirrored). */
  private reverseIndex = new Map<string, Set<string>>();

  setKnownNoteIds(ids: Iterable<string>): void {
    this.knownNoteIds = new Set(ids);
  }

  addKnownNoteId(id: string): void {
    this.knownNoteIds.add(id);
  }

  removeKnownNoteId(id: string): void {
    this.knownNoteIds.delete(id);
  }

  /** Clears everything and re-derives from scratch. Keeps the current library and known-note-id set. */
  rebuild(files: RelationshipFileInput[]): void {
    this.fileInputs = new Map();
    this.ledgerObjects = new Map();
    this.invalidEntries = new Map();
    this.parsedByPath = new Map();
    this.reverseIndex = new Map();
    for (const file of files) this.applyFile(file);
  }

  /** Resets the store to a blank slate: no files, default (empty) library, no known notes. */
  clear(): void {
    this.library = EMPTY_LIBRARY;
    this.knownNoteIds = new Set();
    this.fileInputs = new Map();
    this.ledgerObjects = new Map();
    this.invalidEntries = new Map();
    this.parsedByPath = new Map();
    this.reverseIndex = new Map();
  }

  /**
   * Swaps the track library and re-derives every currently-known file against
   * it. Necessary because flipping a categorical option's `mutual` flag (or
   * adding/removing a custom track/option) changes how every directive
   * resolves and mirrors — history must be re-derived, not patched.
   */
  setLibrary(library: TrackLibrary): void {
    this.library = library;
    const files = [...this.fileInputs.values()];
    this.fileInputs = new Map();
    this.ledgerObjects = new Map();
    this.invalidEntries = new Map();
    this.parsedByPath = new Map();
    this.reverseIndex = new Map();
    for (const file of files) this.applyFile(file);
  }

  /** Replaces all directives (and mirrors) declared by this file — never merges with what was there before. */
  updateFile(fileInput: RelationshipFileInput): StoreChangeResult {
    const removed = this.clearPath(fileInput.path);
    const added = this.applyFile(fileInput);
    const union = new Set([...removed, ...added]);
    return { touched: [...union].map(splitKey) };
  }

  removeFile(path: string): StoreChangeResult {
    const removed = this.clearPath(path);
    return { touched: [...removed].map(splitKey) };
  }

  ledgers(): Ledger[] {
    return [...this.ledgerObjects.values()];
  }

  ledgersFor(entityId: string, as: LedgersAs): Ledger[] {
    return this.ledgers().filter((l) => {
      if (as === 'holder') return l.holder === entityId;
      if (as === 'observer') return l.observer === entityId;
      return l.holder === entityId || l.observer === entityId;
    });
  }

  invalid(): InvalidDirectiveEntry[] {
    const all: InvalidDirectiveEntry[] = [];
    for (const entries of this.invalidEntries.values()) all.push(...entries);
    return all.sort((a, b) => {
      if (a.path !== b.path) return a.path < b.path ? -1 : 1;
      return (a.ordinal ?? -1) - (b.ordinal ?? -1);
    });
  }

  directivesIn(
    paths: string[],
  ): Array<{ path: string; title?: string; directives: ParsedDirective[] }> {
    return paths.map((path) => {
      const cached = this.parsedByPath.get(path);
      return { path, title: cached?.title, directives: cached?.directives ?? [] };
    });
  }

  /** Removes any deltas this path previously contributed (direct or mirrored) and forgets its metadata. */
  private clearPath(path: string): Set<string> {
    const touched = this.reverseIndex.get(path) ?? new Set<string>();
    for (const key of touched) {
      const ledger = this.ledgerObjects.get(key);
      if (!ledger) continue;
      const survivors = ledger.deltas.filter((d) => d.declaredIn.path !== path);
      if (survivors.length === 0) {
        this.ledgerObjects.delete(key);
      } else {
        const { holder, observer, track } = splitKey(key);
        this.ledgerObjects.set(key, { holder, observer, track, deltas: survivors });
      }
    }
    this.reverseIndex.delete(path);
    this.fileInputs.delete(path);
    this.invalidEntries.delete(path);
    this.parsedByPath.delete(path);
    return touched;
  }

  /** Parses and interprets one file's directives, adding their deltas (and mirrors) to the store. */
  private applyFile(fileInput: RelationshipFileInput): Set<string> {
    const { path, source, isEvent, epochSeconds, title } = fileInput;
    this.fileInputs.set(path, fileInput);

    const { directives, errors } = parseDirectives(source);
    this.parsedByPath.set(path, { title, directives });

    const invalid: InvalidDirectiveEntry[] = errors.map((e) => ({
      path,
      from: e.from,
      to: e.to,
      messages: [e.message],
    }));

    const touched = new Set<string>();
    const additions = new Map<string, RelationshipDelta[]>();
    const noDate = isEvent && (epochSeconds === null || epochSeconds === undefined);

    for (const d of directives) {
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
        resolveTrack: (id) => resolveTrack(id, this.library),
        isKnownNote: (id) => this.knownNoteIds.has(id),
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
      touched.add(key);
      pushTo(additions, key, delta);

      const track = resolveTrack(trackId, this.library);
      if (track && track.kind === 'categorical') {
        const spec = track.spec as CategoricalTrackSpec;
        const mirrorKey = ledgerKey(observer, holder, trackId);

        if (op.op === 'add' || op.op === 'remove') {
          const optSpec = spec.options.find((o) => o.key === op.key);
          if (optSpec?.mutual) {
            const mirrorDelta: RelationshipDelta = {
              ...op,
              at,
              declaredIn: { path, ordinal: d.ordinal },
              mirrored: true,
            };
            if (reason) mirrorDelta.reason = reason;
            touched.add(mirrorKey);
            pushTo(additions, mirrorKey, mirrorDelta);
          }
        } else if (op.op === 'set') {
          const setKeys = Array.isArray(op.value) ? op.value : [String(op.value)];
          for (const optSpec of spec.options) {
            if (!optSpec.mutual) continue;
            const mirrorOp: DeltaOp = setKeys.includes(optSpec.key)
              ? { op: 'add', key: optSpec.key }
              : { op: 'remove', key: optSpec.key };
            const mirrorDelta: RelationshipDelta = {
              ...mirrorOp,
              at,
              declaredIn: { path, ordinal: d.ordinal },
              mirrored: true,
            };
            if (reason) mirrorDelta.reason = reason;
            touched.add(mirrorKey);
            pushTo(additions, mirrorKey, mirrorDelta);
          }
        }
      }
    }

    for (const [key, deltas] of additions) {
      const existing = this.ledgerObjects.get(key);
      const { holder, observer, track } = splitKey(key);
      const merged = existing ? [...existing.deltas, ...deltas] : deltas;
      this.ledgerObjects.set(key, { holder, observer, track, deltas: merged });
    }

    if (invalid.length > 0) this.invalidEntries.set(path, invalid);
    this.reverseIndex.set(path, touched);
    return touched;
  }
}

let singleton: RelationshipsStore | null = null;

export function getRelationshipsStore(): RelationshipsStore {
  if (!singleton) singleton = new RelationshipsStore();
  return singleton;
}
