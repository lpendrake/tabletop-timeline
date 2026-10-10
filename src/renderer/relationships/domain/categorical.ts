/**
 * The categorical (tag) tab's view: which options each holder–observer pair
 * holds now, grouped by tag or by entity, searched with the shared search, with
 * mutual pairs shown once and long name lists truncated. Pure — no IO, no React.
 */
import type { Ledger, TagTrack } from '../../../shared/relationships';
import { optionColour, scaleColourCss } from './scale-colour';
import { searchRows, type SearchableRow, type SearchScope } from './search';
import { applyOrder, entityCardsKey, type ViewOrder } from './view-order';
import { compareLabels, type BaseRow } from './view-rows';

export type CategoricalGroupBy = 'tag' | 'entity';

/** Names shown on a card row before "+N more". */
export const NAME_LIMIT = 10;
/** Pairs shown on a mutual card before "+N more". */
export const MUTUAL_LIMIT = 6;

/** Anything but `'entity'` (a missing or stale saved value) groups by tag. */
export function parseGroupBy(x: unknown): CategoricalGroupBy {
  return x === 'entity' ? 'entity' : 'tag';
}

/** Key of one track's in-memory group-by choice; scoped by campaign because track ids repeat across campaigns. */
export function groupByChoiceKey(campaignPath: string, trackId: string): string {
  return JSON.stringify([campaignPath, trackId]);
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
  ledger: Ledger;
}

export interface OptionChip {
  key: string;
  label: string;
  colour: string;
}

/** A holder shown in a card, carrying what the history popover needs. */
export interface HolderName {
  entryKey: string;
  holderId: string;
  observerId: string;
  option: string;
  label: string;
  ledger: Ledger;
}

/**
 * A mutual relationship once, `a` being the first of the two A–Z. Every mutual add/remove is
 * mirrored, so a lone direction only happens for a self-relationship, where `a === b` is correct.
 */
export interface MutualPair {
  key: string;
  a: HolderName;
  b: HolderName;
}

export interface CardRow {
  id: string;
  label: string;
  chip: OptionChip | null;
  mutual: boolean;
  /** Directions held (`names.length`). */
  count: number;
  names: HolderName[];
}

export interface CategoricalCard {
  id: string;
  kind: CategoricalGroupBy;
  title: string;
  chip: OptionChip | null;
  mutual: boolean;
  /** Directions for a non-mutual card, pairs for a mutual by-tag card; matches `total`/`matched`. */
  count: number;
  rows: CardRow[];
  /** Set for a mutual option's card by tag; every other card lists `rows`. */
  pairs: MutualPair[] | null;
}

export interface CategoricalView {
  groupBy: CategoricalGroupBy;
  cards: CategoricalCard[];
  /** Relationships in scope; a mutual pair counts once. */
  total: number;
  /** Relationships matching the query; equals `total` when the query is blank. */
  matched: number;
  canDrag: boolean;
  /** The view-order list the cards are reordered in; null unless they can be dragged. */
  listKey: string | null;
}

export interface CategoricalViewInput {
  track: TagTrack;
  trackId: string;
  groupBy: CategoricalGroupBy;
  query: string;
  enabledScopes: ReadonlySet<SearchScope> | readonly SearchScope[];
  viewOrder: ViewOrder;
  labelFor: (id: string) => string;
}

/** One entry per option held at `now`. */
export function buildCategoricalEntries(
  baseRows: readonly BaseRow[],
  track: TagTrack,
  labelFor: (id: string) => string,
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

function holderName(entry: CategoricalEntry): HolderName {
  return {
    entryKey: entry.key,
    holderId: entry.holderId,
    observerId: entry.observerId,
    option: entry.option,
    label: entry.holderLabel,
    ledger: entry.ledger,
  };
}

function chipFor(track: TagTrack, option: string): OptionChip {
  return {
    key: option,
    label: track.optionFor(option)?.label ?? option,
    colour: scaleColourCss(optionColour()),
  };
}

/** The chip and mutuality of the tag `name` holds. */
export function nameTag(track: TagTrack, name: HolderName): { chip: OptionChip; mutual: boolean } {
  return {
    chip: chipFor(track, name.option),
    mutual: track.optionFor(name.option)?.mutual === true,
  };
}

function searchableFor(entry: CategoricalEntry, track: TagTrack): SearchableRow {
  return {
    key: entry.key,
    fields: {
      name: entry.holderLabel,
      group: entry.observerLabel,
      tag: [track.optionFor(entry.option)?.label ?? entry.option],
    },
    history: [],
  };
}

function compareHolders(labelFor: (id: string) => string) {
  return (a: HolderName, b: HolderName) => compareLabels(labelFor, a.holderId, b.holderId);
}

/** Groups entries by `keyOf`, keeping first-seen order of keys. */
function groupEntries(
  entries: readonly CategoricalEntry[],
  keyOf: (entry: CategoricalEntry) => string,
): Map<string, CategoricalEntry[]> {
  const groups = new Map<string, CategoricalEntry[]>();
  for (const entry of entries) {
    const key = keyOf(entry);
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }
  return groups;
}

function pairsOf(
  entries: readonly CategoricalEntry[],
  labelFor: (id: string) => string,
): MutualPair[] {
  const compare = compareHolders(labelFor);
  const pairs: MutualPair[] = [];
  for (const [key, group] of groupEntries(entries, relationshipKey)) {
    const [a, b] = group.map(holderName).sort(compare);
    pairs.push({ key, a, b: b ?? a });
  }
  return pairs.sort((x, y) => compare(x.a, y.a) || compare(x.b, y.b));
}

function cardRow(
  identity: Pick<CardRow, 'id' | 'label' | 'chip' | 'mutual'>,
  entries: readonly CategoricalEntry[],
  labelFor: (id: string) => string,
): CardRow {
  const names = entries.map(holderName).sort(compareHolders(labelFor));
  return { ...identity, count: names.length, names };
}

function cardsByTag(
  entries: readonly CategoricalEntry[],
  track: TagTrack,
  labelFor: (id: string) => string,
): CategoricalCard[] {
  const byOption = groupEntries(entries, (e) => e.option);
  const cards: CategoricalCard[] = [];
  for (const spec of track.options) {
    const held = byOption.get(spec.key);
    if (!held) continue;
    const base = {
      id: spec.key,
      kind: 'tag' as const,
      title: spec.label,
      chip: chipFor(track, spec.key),
      mutual: held[0].mutual,
    };
    if (base.mutual) {
      const pairs = pairsOf(held, labelFor);
      cards.push({ ...base, count: pairs.length, rows: [], pairs });
      continue;
    }
    const rows: CardRow[] = [...groupEntries(held, (e) => e.observerId)]
      .map(([observerId, group]) =>
        cardRow(
          { id: observerId, label: labelFor(observerId), chip: null, mutual: false },
          group,
          labelFor,
        ),
      )
      .sort((x, y) => compareLabels(labelFor, x.id, y.id));
    cards.push({ ...base, count: held.length, rows, pairs: null });
  }
  return cards;
}

function cardsByEntity(
  entries: readonly CategoricalEntry[],
  input: CategoricalViewInput,
): CategoricalCard[] {
  const { track, trackId, viewOrder, labelFor } = input;
  const byObserver = groupEntries(entries, (e) => e.observerId);
  const ids = applyOrder([...byObserver.keys()], viewOrder.order[entityCardsKey(trackId)], (a, b) =>
    compareLabels(labelFor, a, b),
  );
  return ids.map((observerId) => {
    const held = byObserver.get(observerId) ?? [];
    const byOption = groupEntries(held, (e) => e.option);
    const rows = track.options.flatMap((spec) => {
      const group = byOption.get(spec.key);
      if (!group) return [];
      const chip = chipFor(track, spec.key);
      return [
        cardRow(
          { id: spec.key, label: chip.label, chip, mutual: group[0].mutual },
          group,
          labelFor,
        ),
      ];
    });
    return {
      id: observerId,
      kind: 'entity',
      title: labelFor(observerId),
      chip: null,
      mutual: false,
      count: held.length,
      rows,
      pairs: null,
    };
  });
}

/** Entries that match the query; a mutual pair is kept whole when either direction matches. */
function visibleEntries(
  entries: readonly CategoricalEntry[],
  input: CategoricalViewInput,
): CategoricalEntry[] {
  const { matchedKeys } = searchRows(
    entries.map((e) => searchableFor(e, input.track)),
    input.query,
    input.enabledScopes,
  );
  const matchedRelationships = new Set(
    entries.filter((e) => matchedKeys.has(e.key)).map(relationshipKey),
  );
  return entries.filter((e) => matchedRelationships.has(relationshipKey(e)));
}

export function deriveCategoricalView(
  entries: readonly CategoricalEntry[],
  input: CategoricalViewInput,
): CategoricalView {
  const { groupBy, trackId, track, labelFor, query } = input;
  const visible = visibleEntries(entries, input);
  const canDrag = groupBy === 'entity' && !isSearching(query);
  const cards =
    groupBy === 'tag' ? cardsByTag(visible, track, labelFor) : cardsByEntity(visible, input);
  return {
    groupBy,
    cards,
    total: new Set(entries.map(relationshipKey)).size,
    matched: new Set(visible.map(relationshipKey)).size,
    canDrag,
    listKey: canDrag ? entityCardsKey(trackId) : null,
  };
}

/** Whether a query is active; a search lists every name instead of truncating. */
export function isSearching(query: string): boolean {
  return query.trim() !== '';
}

/** Names shown in one list before "+N more"; a mutual list is shorter. */
export function listLimit(mutual: boolean): number {
  return mutual ? MUTUAL_LIMIT : NAME_LIMIT;
}

/** What decides how much of a name list is shown. */
export interface ShownState {
  /** Ids (`nameListId`) of the lists shown in full. */
  expanded: ReadonlySet<string>;
  searching: boolean;
}

/** The names to render under `limit`, and how many are hidden. Expanded or searching shows everything. */
export function visibleNames<T>(
  items: readonly T[],
  limit: number,
  state: { expanded: boolean; searching: boolean },
): { shown: T[]; hidden: number } {
  if (state.expanded || state.searching) return { shown: [...items], hidden: 0 };
  return { shown: items.slice(0, limit), hidden: Math.max(0, items.length - limit) };
}

/** Id of one name list (a card row, or a mutual card's pairs when `rowId` is null) for its expanded state. */
export function nameListId(
  groupBy: CategoricalGroupBy,
  cardId: string,
  rowId: string | null,
): string {
  return JSON.stringify([groupBy, cardId, rowId]);
}

/** The names a list renders under `shownState`. */
function shownIn<T>(
  items: readonly T[],
  limit: number,
  listId: string,
  shownState: ShownState,
): T[] {
  return visibleNames(items, limit, {
    expanded: shownState.expanded.has(listId),
    searching: shownState.searching,
  }).shown;
}

/**
 * The current name for `entryKey` if the view renders it, else null. Truncated names are not
 * rendered, so they are not found; this uses the same `visibleNames` inputs as the lists do.
 */
export function findShownName(
  view: CategoricalView,
  entryKey: string,
  shownState: ShownState,
): HolderName | null {
  for (const card of view.cards) {
    const pairs = shownIn(
      card.pairs ?? [],
      MUTUAL_LIMIT,
      nameListId(card.kind, card.id, null),
      shownState,
    );
    for (const pair of pairs) {
      const found = [pair.a, pair.b].find((n) => n.entryKey === entryKey);
      if (found) return found;
    }
    for (const row of card.rows) {
      const rowNames = shownIn(
        row.names,
        listLimit(row.mutual),
        nameListId(card.kind, card.id, row.id),
        shownState,
      );
      const found = rowNames.find((n) => n.entryKey === entryKey);
      if (found) return found;
    }
  }
  return null;
}

/** A copy of `ids` with `id` removed if present, else added. */
export function toggledId(ids: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(ids);
  if (!next.delete(id)) next.add(id);
  return next;
}
