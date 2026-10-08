/**
 * Search for the by-track Relationships view: plain-word tokenising, per-kind
 * scopes, AND-across-words matching over row-level fields and history entries,
 * and highlight ranges. Pure — no IO, no React.
 */
import { NOTE_DEFAULT_REASON } from '../../../shared/relationships';
import type { RelationshipDelta } from '../../../shared/relationships/model';
import type { TrackKind } from '../../../shared/relationships/spec';

export type SearchScope = 'name' | 'band' | 'rung' | 'group' | 'tag' | 'event' | 'reason';

/** One history entry of a row, already reduced to searchable text. */
export interface SearchableHistoryEntry {
  key: string;
  event?: string;
  reason?: string;
}

/** A row as the caller describes it for searching. `key` must be unique among rows. */
export interface SearchableRow {
  key: string;
  fields: { name?: string; band?: string; rung?: string; group?: string; tag?: string[] };
  history: SearchableHistoryEntry[];
}

export interface SearchResult {
  matchedKeys: Set<string>;
  /** Only rows whose match needed history appear; values are the entries matching at least one word. */
  historyHits: Map<string, Set<string>>;
  total: number;
  matched: number;
}

const SCOPES: Record<TrackKind, SearchScope[]> = {
  numeric: ['name', 'band', 'event', 'reason'],
  ordinal: ['name', 'rung', 'event', 'reason'],
  categorical: ['name', 'group', 'tag'],
};

/** The scopes offered for a track kind, in display order. */
export function scopesForKind(kind: TrackKind): SearchScope[] {
  return SCOPES[kind];
}

/** Toggle label for a scope; `rung` is labelled with the track's own name. */
export function scopeLabel(scope: SearchScope, trackName: string): string {
  switch (scope) {
    case 'name':
      return 'Name';
    case 'band':
      return 'Band';
    case 'rung':
      return trackName;
    case 'group':
      return 'Group';
    case 'tag':
      return 'Tag';
    case 'event':
      return 'Event';
    case 'reason':
      return 'Reason';
  }
}

/** Splits a query into lowercase words on whitespace; empties dropped. No filter syntax. */
export function tokenise(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/**
 * Event title (of the declaring event or note, via `titleByPath`) and reason
 * for a delta. An empty reason falls back to the event title for a dated delta,
 * and to `NOTE_DEFAULT_REASON` when there is neither.
 */
export function historyEntryText(
  delta: RelationshipDelta,
  titleByPath: ReadonlyMap<string, string>,
): { event: string | undefined; reason: string } {
  const event = titleByPath.get(delta.declaredIn.path);
  const reason =
    delta.reason?.trim() || (delta.at === null ? undefined : event) || NOTE_DEFAULT_REASON;
  return { event, reason };
}

function has(lowered: string | undefined, word: string): boolean {
  return lowered !== undefined && lowered.includes(word);
}

/**
 * AND across words: each word must match an enabled row-level field or (with
 * Event/Reason enabled) some history entry. Different words may match
 * different entries. If any word needed history, `historyHits` records every
 * entry matching at least one word. Empty query matches everything.
 */
export function searchRows(
  rows: readonly SearchableRow[],
  query: string,
  enabledScopes: ReadonlySet<SearchScope> | readonly SearchScope[],
): SearchResult {
  const words = tokenise(query);
  const matchedKeys = new Set<string>();
  const historyHits = new Map<string, Set<string>>();
  if (words.length === 0) {
    for (const r of rows) matchedKeys.add(r.key);
    return { matchedKeys, historyHits, total: rows.length, matched: rows.length };
  }

  const scopes: ReadonlySet<SearchScope> =
    enabledScopes instanceof Set ? enabledScopes : new Set(enabledScopes);
  const eventOn = scopes.has('event');
  const reasonOn = scopes.has('reason');
  const historyOn = eventOn || reasonOn;
  const eventLower = new Map<string, string>();

  for (const row of rows) {
    const f = row.fields;
    const name = scopes.has('name') ? f.name?.toLowerCase() : undefined;
    const band = scopes.has('band') ? f.band?.toLowerCase() : undefined;
    const rung = scopes.has('rung') ? f.rung?.toLowerCase() : undefined;
    const group = scopes.has('group') ? f.group?.toLowerCase() : undefined;
    const tags = scopes.has('tag') ? f.tag?.map((t) => t.toLowerCase()) : undefined;

    // Bit i set = words[i] still needs a history match.
    let needed = 0;
    let ok = true;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (
        has(name, w) ||
        has(band, w) ||
        has(rung, w) ||
        has(group, w) ||
        tags?.some((t) => t.includes(w))
      ) {
        continue;
      }
      if (!historyOn) {
        ok = false;
        break;
      }
      needed |= 1 << i;
    }
    if (!ok) continue;

    if (needed !== 0) {
      let hits: Set<string> | undefined;
      let found = 0;
      for (const entry of row.history) {
        // Event titles repeat across many entries, so their lowercase form is memoised.
        let event: string | undefined;
        if (eventOn && entry.event !== undefined) {
          event = eventLower.get(entry.event);
          if (event === undefined) {
            event = entry.event.toLowerCase();
            eventLower.set(entry.event, event);
          }
        }
        // A reason that fell back to the event title is the same string: lowercase once.
        const reason = !reasonOn
          ? undefined
          : entry.reason === entry.event && eventOn
            ? event
            : entry.reason?.toLowerCase();
        for (let i = 0; i < words.length; i++) {
          if (has(event, words[i]) || has(reason, words[i])) {
            (hits ??= new Set()).add(entry.key);
            found |= 1 << i;
          }
        }
      }
      if ((needed & ~found) !== 0) continue;
      historyHits.set(row.key, hits ?? new Set());
    }
    matchedKeys.add(row.key);
  }

  return { matchedKeys, historyHits, total: rows.length, matched: matchedKeys.size };
}

/** Case-insensitive `[start, end)` ranges of every word occurrence in `text`, merged when overlapping or touching. */
export function highlightRanges(text: string, query: string): Array<[number, number]> {
  const words = tokenise(query);
  if (words.length === 0) return [];
  const lower = text.toLowerCase();
  const raw: Array<[number, number]> = [];
  for (const word of words) {
    let from = 0;
    for (;;) {
      const i = lower.indexOf(word, from);
      if (i < 0) break;
      raw.push([i, i + word.length]);
      from = i + 1;
    }
  }
  raw.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

/** `"3 of 15"`. */
export function countLabel(matched: number, total: number): string {
  return `${matched} of ${total}`;
}

/** `Nothing matches "blight"`, plus ` in the enabled scopes` when any scope toggle is off. */
export function emptyMessage(query: string, anyScopeDisabled: boolean): string {
  return `Nothing matches "${query.trim()}"${anyScopeDisabled ? ' in the enabled scopes' : ''}`;
}
