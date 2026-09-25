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

import type { Ledger, RelationshipDelta, TrackLibrary } from '../shared/relationships/index.js';
import type { ParsedDirective } from '../shared/relationships/index.js';
import {
  EMPTY_TRACK_LIBRARY,
  interpretDirective,
  noteIdOf,
  parseDirectives,
  resolveTrack,
  roleValue,
} from '../shared/relationships/index.js';
import type { InvalidDirectiveEntry, LedgersAs } from '../shared/relationships/ipc-types.js';

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
  /** For a note: its frontmatter id. Ignored for an event. */
  noteId?: string;
}

export type { InvalidDirectiveEntry, LedgersAs };

export interface LedgerKeyTriple {
  holder: string;
  observer: string;
  track: string;
}

export interface StoreChangeResult {
  touched: LedgerKeyTriple[];
  /** This file's own invalid-directive entries differ from before the change. */
  invalidChanged: boolean;
  /** The known-notes map (path -> id) changed — a note was created, edited, deleted or moved. */
  knownNotesChanged: boolean;
}

/** A note the store should know about, e.g. from the entity index. */
export interface KnownNote {
  path: string;
  id: string;
}

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

function deltaIdentity(d: RelationshipDelta): string {
  return `${d.declaredIn.path}#${d.declaredIn.ordinal}`;
}

/** Deep-enough equality for change detection: two invalid-entry lists built the same way. */
function sameInvalidEntries(
  a: InvalidDirectiveEntry[] | undefined,
  b: InvalidDirectiveEntry[] | undefined,
): boolean {
  if ((a?.length ?? 0) === 0 && (b?.length ?? 0) === 0) return true;
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

interface ParsedRecord {
  title?: string;
  directives: ParsedDirective[];
}

export class RelationshipsStore {
  private library: TrackLibrary = EMPTY_TRACK_LIBRARY;
  private fileInputs = new Map<string, RelationshipFileInput>();
  private ledgerObjects = new Map<string, Ledger>();
  private invalidEntries = new Map<string, InvalidDirectiveEntry[]>();
  private parsedByPath = new Map<string, ParsedRecord>();
  /** path -> set of ledger keys that path currently contributes deltas to (direct or mirrored). */
  private reverseIndex = new Map<string, Set<string>>();

  /** note path -> its frontmatter id. The store's own record of "known notes". */
  private noteIdByPath = new Map<string, string>();
  /** note id -> set of note paths currently claiming it (normally at most one). */
  private pathsByNoteId = new Map<string, Set<string>>();
  /** note id -> set of file paths whose directives reference it (as holder or observer). */
  private referencedBy = new Map<string, Set<string>>();
  /** file path -> set of note ids its directives currently reference. Mirror of referencedBy, kept for O(1) cleanup. */
  private referencedIdsByPath = new Map<string, Set<string>>();

  /**
   * Seeds the known-notes map (path -> id) wholesale, e.g. from the entity
   * index at campaign load. Populating every note's id up front — before any
   * directive is interpreted — means a directive referencing a note that
   * hasn't been scanned yet still resolves correctly regardless of file
   * order during a bulk rebuild.
   */
  seedKnownNotes(notes: Iterable<KnownNote>): void {
    this.noteIdByPath = new Map();
    this.pathsByNoteId = new Map();
    for (const { path, id } of notes) {
      this.noteIdByPath.set(path, id);
      let set = this.pathsByNoteId.get(id);
      if (!set) {
        set = new Set();
        this.pathsByNoteId.set(id, set);
      }
      set.add(path);
    }
  }

  private isKnownNote(id: string): boolean {
    return (this.pathsByNoteId.get(id)?.size ?? 0) > 0;
  }

  /** Registers/updates one note's id. Returns whether the note's own path->id mapping changed. */
  private registerNoteId(path: string, id: string): { pathIdChanged: boolean } {
    const prevId = this.noteIdByPath.get(path);
    if (prevId === id) return { pathIdChanged: false };

    if (prevId !== undefined) {
      const prevSet = this.pathsByNoteId.get(prevId);
      if (prevSet) {
        prevSet.delete(path);
        if (prevSet.size === 0) this.pathsByNoteId.delete(prevId);
      }
    }

    this.noteIdByPath.set(path, id);
    let set = this.pathsByNoteId.get(id);
    if (!set) {
      set = new Set();
      this.pathsByNoteId.set(id, set);
    }
    set.add(path);
    return { pathIdChanged: true };
  }

  /** Drops a note's id registration. Returns the id it held and whether that id is now completely unknown. */
  private unregisterNoteId(path: string): { id: string; becameUnknown: boolean } | null {
    const id = this.noteIdByPath.get(path);
    if (id === undefined) return null;
    this.noteIdByPath.delete(path);
    const set = this.pathsByNoteId.get(id);
    let becameUnknown = false;
    if (set) {
      set.delete(path);
      if (set.size === 0) {
        this.pathsByNoteId.delete(id);
        becameUnknown = true;
      }
    }
    return { id, becameUnknown };
  }

  /** Re-derives every file referencing `noteId` (except `excludePath`), e.g. after that id becomes known/unknown. */
  private rederiveReferencing(noteId: string, excludePath?: string): Set<string> {
    const paths = this.referencedBy.get(noteId);
    if (!paths || paths.size === 0) return new Set();
    const touched = new Set<string>();
    for (const p of [...paths]) {
      if (p === excludePath) continue;
      const input = this.fileInputs.get(p);
      if (!input) continue;
      for (const k of this.clearPath(p)) touched.add(k);
      for (const k of this.applyFile(input)) touched.add(k);
    }
    return touched;
  }

  /** Clears everything and re-derives from scratch. Keeps the current known-note-id set; optionally swaps the library. */
  rebuild(files: RelationshipFileInput[], library?: TrackLibrary): void {
    if (library) this.library = library;
    this.fileInputs = new Map();
    this.ledgerObjects = new Map();
    this.invalidEntries = new Map();
    this.parsedByPath = new Map();
    this.reverseIndex = new Map();
    this.referencedBy = new Map();
    this.referencedIdsByPath = new Map();
    for (const file of files) this.applyFile(file);
  }

  /** Resets the store to a blank slate: no files, default (empty) library, no known notes. */
  clear(): void {
    this.library = EMPTY_TRACK_LIBRARY;
    this.fileInputs = new Map();
    this.ledgerObjects = new Map();
    this.invalidEntries = new Map();
    this.parsedByPath = new Map();
    this.reverseIndex = new Map();
    this.noteIdByPath = new Map();
    this.pathsByNoteId = new Map();
    this.referencedBy = new Map();
    this.referencedIdsByPath = new Map();
  }

  /**
   * Swaps the track library and re-derives every currently-known file against
   * it. Necessary because flipping a categorical option's `mutual` flag (or
   * adding/removing a custom track/option) changes how every directive
   * resolves and mirrors — history must be re-derived, not patched.
   */
  setLibrary(library: TrackLibrary): void {
    const files = [...this.fileInputs.values()];
    this.rebuild(files, library);
  }

  /** Replaces all directives (and mirrors) declared by this file — never merges with what was there before. */
  updateFile(fileInput: RelationshipFileInput): StoreChangeResult {
    const { path, isEvent, noteId } = fileInput;
    const invalidBefore = this.invalidEntries.get(path);

    const removed = this.clearPath(path);

    let knownNotesChanged = false;
    let becameKnown = false;
    if (!isEvent && noteId) {
      const { pathIdChanged } = this.registerNoteId(path, noteId);
      knownNotesChanged = pathIdChanged;
      becameKnown = pathIdChanged && this.pathsByNoteId.get(noteId)?.size === 1;
    }

    const added = this.applyFile(fileInput);
    const touched = new Set([...removed, ...added]);

    if (becameKnown && noteId) {
      for (const k of this.rederiveReferencing(noteId, path)) touched.add(k);
    }

    const invalidAfter = this.invalidEntries.get(path);
    const invalidChanged = !sameInvalidEntries(invalidBefore, invalidAfter);

    return { touched: [...touched].map(splitKey), invalidChanged, knownNotesChanged };
  }

  removeFile(path: string): StoreChangeResult {
    const invalidBefore = this.invalidEntries.get(path);
    const removed = this.clearPath(path);
    const touched = new Set(removed);

    const noteInfo = this.unregisterNoteId(path);
    if (noteInfo?.becameUnknown) {
      for (const k of this.rederiveReferencing(noteInfo.id)) touched.add(k);
    }

    const invalidChanged = !sameInvalidEntries(invalidBefore, undefined);
    const knownNotesChanged = noteInfo !== null;

    return { touched: [...touched].map(splitKey), invalidChanged, knownNotesChanged };
  }

  ledgers(): Ledger[] {
    return [...this.ledgerObjects.values()].map((l) => this.cleanLedger(l));
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
    all.push(...this.setConflictInvalidEntries());
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

  /**
   * A ledger with more than one undated (note-declared) `set` delta among
   * different files: only one note may set a relationship, so every such
   * delta is excluded here — surfaced instead via setConflictInvalidEntries().
   */
  private conflictingDeltaKeys(ledger: Ledger): Set<string> {
    const undatedSets = ledger.deltas.filter((d) => d.op === 'set' && d.at === null);
    if (undatedSets.length <= 1) return new Set();
    return new Set(undatedSets.map(deltaIdentity));
  }

  private cleanLedger(ledger: Ledger): Ledger {
    const conflictKeys = this.conflictingDeltaKeys(ledger);
    if (conflictKeys.size === 0) return ledger;
    return { ...ledger, deltas: ledger.deltas.filter((d) => !conflictKeys.has(deltaIdentity(d))) };
  }

  private directiveRange(path: string, ordinal: number): { from: number; to: number } {
    const directive = this.parsedByPath.get(path)?.directives[ordinal];
    return directive ? { from: directive.from, to: directive.to } : { from: 0, to: 0 };
  }

  private setConflictInvalidEntries(): InvalidDirectiveEntry[] {
    const out: InvalidDirectiveEntry[] = [];
    for (const ledger of this.ledgerObjects.values()) {
      const undatedSets = ledger.deltas.filter((d) => d.op === 'set' && d.at === null);
      if (undatedSets.length <= 1) continue;
      for (const d of undatedSets) {
        const others = [
          ...new Set(undatedSets.filter((o) => o !== d).map((o) => o.declaredIn.path)),
        ];
        const range = this.directiveRange(d.declaredIn.path, d.declaredIn.ordinal);
        out.push({
          path: d.declaredIn.path,
          ordinal: d.declaredIn.ordinal,
          from: range.from,
          to: range.to,
          messages: [`Only one note may set this relationship; also set in ${others.join(', ')}`],
        });
      }
    }
    return out;
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

    const referencedIds = this.referencedIdsByPath.get(path);
    if (referencedIds) {
      for (const id of referencedIds) {
        const set = this.referencedBy.get(id);
        if (!set) continue;
        set.delete(path);
        if (set.size === 0) this.referencedBy.delete(id);
      }
      this.referencedIdsByPath.delete(path);
    }

    return touched;
  }

  private addReferencedBy(noteId: string, path: string): void {
    let set = this.referencedBy.get(noteId);
    if (!set) {
      set = new Set();
      this.referencedBy.set(noteId, set);
    }
    set.add(path);

    let ids = this.referencedIdsByPath.get(path);
    if (!ids) {
      ids = new Set();
      this.referencedIdsByPath.set(path, ids);
    }
    ids.add(noteId);
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
      // Track every note referenced by a holder/observer role — regardless
      // of whether the directive is otherwise valid — so a later change to
      // that note's known-ness (created/deleted) knows to re-derive this file.
      for (const role of ['holder', 'observer'] as const) {
        const raw = roleValue(d, role);
        if (raw === undefined) continue;
        const noteId = noteIdOf(raw);
        if (noteId !== null) this.addReferencedBy(noteId, path);
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
        resolveTrack: (id) => resolveTrack(id, this.library),
        isKnownNote: (id) => this.isKnownNote(id),
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
      touched.add(key);
      pushTo(additions, key, delta);

      const track = resolveTrack(trackId, this.library);
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
          touched.add(mirrorKey);
          pushTo(additions, mirrorKey, mirrorDelta);
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
