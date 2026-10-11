/**
 * The categorical (tag) tab's table: which options each holder holds toward
 * which observer now, as rows reading holder · tag · observer, in sections by
 * holder or by tag, searched with the shared search. A mutual pair counts as
 * one relationship. Pure — no IO, no React.
 */
import type { Ledger, TagTrack } from '../../../shared/relationships';
import { latestReason } from './categorical-history';
import { optionColour, scaleColourCss } from './scale-colour';
import { searchRows, type SearchableRow, type SearchScope } from './search';
import { compareLabels, compareText, type BaseRow } from './view-rows';

export type CategoricalGroupBy = 'holder' | 'tag';

/** Anything but `'tag'` (a missing or stale saved value) groups by holder. */
export function parseGroupBy(x: unknown): CategoricalGroupBy {
  return x === 'tag' ? 'tag' : 'holder';
}

/** One held direction: `holderId` has `option` toward `observerId`. */
export interface CategoricalEntry {
  key: string;
  holderId: string;
  observerId: string;
  option: string;
  holderLabel: string;
  observerLabel: string;
  mutual: boolean;
  /** Reason of the latest change; never blank. */
  reason: string;
  ledger: Ledger;
}

export interface OptionChip {
  key: string;
  label: string;
  colour: string;
}

/** One line of the table: `holder` has `option` toward `observer`. */
export interface TableRow {
  key: string;
  holderId: string;
  holderLabel: string;
  observerId: string;
  observerLabel: string;
  option: string;
  chip: OptionChip;
  mutual: boolean;
  /** Reason of the latest change; never blank. */
  reason: string;
  ledger: Ledger;
}

export interface TableSection {
  id: string;
  kind: CategoricalGroupBy;
  /** The holder's label, or the option's label. */
  title: string;
  /** The option's chip for a by-tag section; null by holder. */
  chip: OptionChip | null;
  mutual: boolean;
  rows: TableRow[];
}

export interface CategoricalTable {
  groupBy: CategoricalGroupBy;
  sections: TableSection[];
  /** Relationships in scope; a mutual pair counts once. */
  total: number;
  /** Relationships matching the query; equals `total` when the query is blank. */
  matched: number;
}

export interface CategoricalTableInput {
  track: TagTrack;
  groupBy: CategoricalGroupBy;
  query: string;
  enabledScopes: ReadonlySet<SearchScope> | readonly SearchScope[];
  labelFor: (id: string) => string;
}

/** One entry per option held at `now`. */
export function buildCategoricalEntries(
  baseRows: readonly BaseRow[],
  track: TagTrack,
  labelFor: (id: string) => string,
  now: number,
  titleByPath: ReadonlyMap<string, string>,
): CategoricalEntry[] {
  const entries: CategoricalEntry[] = [];
  for (const row of baseRows) {
    for (const option of Array.isArray(row.value) ? row.value : []) {
      entries.push({
        key: `${row.key}|${option}`,
        holderId: row.holderId,
        observerId: row.observerId,
        option,
        holderLabel: labelFor(row.holderId),
        observerLabel: labelFor(row.observerId),
        mutual: track.optionFor(option)?.mutual === true,
        reason: latestReason(row.ledger, track, option, now, titleByPath, labelFor),
        ledger: row.ledger,
      });
    }
  }
  return entries;
}

/** Both directions of a mutual relationship share this key; other entries use their own. */
function relationshipKey(entry: CategoricalEntry): string {
  if (!entry.mutual) return entry.key;
  const [first, second] = [entry.holderId, entry.observerId].sort();
  return `${entry.option}|${first}|${second}`;
}

function chipFor(track: TagTrack, option: string): OptionChip {
  return {
    key: option,
    label: track.optionFor(option)?.label ?? option,
    colour: scaleColourCss(optionColour()),
  };
}

function searchableFor(entry: CategoricalEntry, track: TagTrack): SearchableRow {
  return {
    key: entry.key,
    fields: {
      holder: entry.holderLabel,
      tag: [chipFor(track, entry.option).label],
      observer: entry.observerLabel,
    },
    history: [],
  };
}

function rowFor(entry: CategoricalEntry, track: TagTrack): TableRow {
  return {
    key: entry.key,
    holderId: entry.holderId,
    holderLabel: entry.holderLabel,
    observerId: entry.observerId,
    observerLabel: entry.observerLabel,
    option: entry.option,
    chip: chipFor(track, entry.option),
    mutual: entry.mutual,
    reason: entry.reason,
    ledger: entry.ledger,
  };
}

/** Groups items by `keyOf`, keeping first-seen order of keys. */
function groupItems<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

function compareKeys(a: TableRow, b: TableRow): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/** A–Z by tag label, then observer. */
function byTagThenObserver(labelFor: (id: string) => string) {
  return (a: TableRow, b: TableRow) =>
    compareText(a.chip.label, b.chip.label) ||
    compareLabels(labelFor, a.observerId, b.observerId) ||
    compareKeys(a, b);
}

/** A–Z by holder, then observer. */
function byHolderThenObserver(labelFor: (id: string) => string) {
  return (a: TableRow, b: TableRow) =>
    compareLabels(labelFor, a.holderId, b.holderId) ||
    compareLabels(labelFor, a.observerId, b.observerId) ||
    compareKeys(a, b);
}

function sectionsByHolder(
  entries: readonly CategoricalEntry[],
  input: CategoricalTableInput,
): TableSection[] {
  const { track, labelFor } = input;
  const byHolder = groupItems(entries, (e) => e.holderId);
  return [...byHolder.keys()]
    .sort((a, b) => compareLabels(labelFor, a, b))
    .map((holderId) => {
      const rows = (byHolder.get(holderId) ?? [])
        .map((e) => rowFor(e, track))
        .sort(byTagThenObserver(labelFor));
      return {
        id: holderId,
        kind: 'holder',
        title: labelFor(holderId),
        chip: null,
        mutual: false,
        rows,
      };
    });
}

/** Each mutual pair once: the A–Z-first holder's entry among the matched directions (both, when the query is blank). */
function canonicalEntries(
  entries: readonly CategoricalEntry[],
  labelFor: (id: string) => string,
  matchedKeys: ReadonlySet<string>,
): CategoricalEntry[] {
  return [...groupItems(entries, relationshipKey).values()].map((group) => {
    const matched = group.filter((e) => matchedKeys.has(e.key));
    return (matched.length > 0 ? matched : group).sort((a, b) =>
      compareLabels(labelFor, a.holderId, b.holderId),
    )[0];
  });
}

function sectionsByTag(
  entries: readonly CategoricalEntry[],
  input: CategoricalTableInput,
  matchedKeys: ReadonlySet<string>,
): TableSection[] {
  const { track, labelFor } = input;
  const byOption = groupItems(entries, (e) => e.option);
  return track.options.flatMap((spec) => {
    const held = byOption.get(spec.key);
    if (!held) return [];
    const rows = canonicalEntries(held, labelFor, matchedKeys)
      .map((e) => rowFor(e, track))
      .sort(byHolderThenObserver(labelFor));
    return [
      {
        id: spec.key,
        kind: 'tag' as const,
        title: spec.label,
        chip: chipFor(track, spec.key),
        mutual: held[0].mutual,
        rows,
      },
    ];
  });
}

export function deriveCategoricalTable(
  entries: readonly CategoricalEntry[],
  input: CategoricalTableInput,
): CategoricalTable {
  const { groupBy: grouping, track, query, enabledScopes } = input;
  const { matchedKeys } = searchRows(
    entries.map((e) => searchableFor(e, track)),
    query,
    enabledScopes,
  );
  const matchedEntries = entries.filter((e) => matchedKeys.has(e.key));
  // By holder each direction is its own row, so only a matching direction is listed. By tag a
  // mutual pair is one row, listed when either direction matches.
  const matchedRelationships = new Set(matchedEntries.map(relationshipKey));
  const visible =
    grouping === 'holder'
      ? matchedEntries
      : entries.filter((e) => matchedRelationships.has(relationshipKey(e)));
  return {
    groupBy: grouping,
    sections:
      grouping === 'holder'
        ? sectionsByHolder(visible, input)
        : sectionsByTag(visible, input, matchedKeys),
    total: new Set(entries.map(relationshipKey)).size,
    matched: matchedRelationships.size,
  };
}

/** A copy of `ids` with `id` removed if present, else added: folds or unfolds a section. */
export function toggledId(ids: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(ids);
  if (!next.delete(id)) next.add(id);
  return next;
}

/** The key a section's fold state is stored under; unique across both groupings. */
export function sectionFoldKey(section: TableSection): string {
  return `${section.kind}:${section.id}`;
}

/** The query to highlight in each cell: the search query where that cell's scope is enabled, else blank. */
export function highlightQueries(
  query: string,
  scopes: ReadonlyArray<{ scope: SearchScope; enabled: boolean }>,
): Record<'holder' | 'tag' | 'observer', string> {
  const on = (scope: SearchScope) =>
    scopes.some((s) => s.scope === scope && s.enabled) ? query : '';
  return { holder: on('holder'), tag: on('tag'), observer: on('observer') };
}
