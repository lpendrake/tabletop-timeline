/**
 * The whole row derivation for the by-track Relationships view: values, search,
 * sorting, grouping and (lazy) history. Pure — no IO, no React.
 *
 * Two stages so a keystroke only re-runs the cheap one:
 *  1. `buildBaseRows` — per-ledger value, colour, last change and searchable
 *     text. Depends on data only (ledgers, track, now, titles, labels).
 *  2. `deriveView` — search, sort, grouping, expand state and history.
 * `deriveViewRows` composes both for callers (and tests) that want one call.
 */
import type {
  Ledger,
  RelationshipDelta,
  ResolvedTrack,
  TrackValue,
} from '../../../shared/relationships';
import { computeValue, currentValue } from '../../../shared/relationships';
import { formatEntryDate } from './entry-date';
import { ALL_HOLDERS, ledgersForHolder } from './holders';
import { bandIndexFor, rungColour, scaleColourCss, valueColour } from './scale-colour';
import {
  historyEntryText,
  searchRows,
  type SearchableRow,
  type SearchResult,
  type SearchScope,
} from './search';
import { entryCount, lastChange, sortRows, type RowSort, type SortableRow } from './sort';
import { applyOrder, groupListKey, rowListKey, type ViewOrder } from './view-order';

const ACCENT_CSS = 'var(--theme-accent-gold)';

export interface HistoryEntry {
  key: string;
  at: number | null;
  dateLabel: string;
  delta: RelationshipDelta;
  runningValue: TrackValue;
  runningFormatted: string;
  applied: boolean;
  mirrored: boolean;
  eventTitle: string | null;
  reason: string | null;
  /** null when the row has no search history hits; else whether this entry is one of them. */
  hit: boolean | null;
}

export interface ViewRow {
  key: string;
  listKey: string;
  holderId: string;
  observerId: string;
  label: string;
  ledger: Ledger;
  value: TrackValue;
  formatted: string;
  stateLabel: string | null;
  colour: string;
  lastChange: { delta: RelationshipDelta; at: number | null; dateLabel: string } | null;
  entryCount: number;
  onlyFuture: boolean;
  expanded: boolean;
  history: HistoryEntry[] | null;
}

export interface ViewGroup {
  holderId: string;
  label: string;
  listKey: string;
  collapsed: boolean;
  rows: ViewRow[];
}

/** Data-only part of a row (stage 1). */
export interface BaseRow {
  key: string;
  holderId: string;
  observerId: string;
  label: string;
  ledger: Ledger;
  value: TrackValue;
  formatted: string;
  stateLabel: string | null;
  colour: string;
  lastChange: ViewRow['lastChange'];
  entryCount: number;
  onlyFuture: boolean;
  sortValue: number | null;
  searchable: SearchableRow;
}

export interface BaseRowsInput {
  ledgers: readonly Ledger[];
  track: ResolvedTrack;
  trackId: string;
  now: number;
  titleByPath: ReadonlyMap<string, string>;
  labelFor: (id: string) => string;
}

export interface DeriveViewInput {
  track: ResolvedTrack;
  trackId: string;
  /** A holder id, or `'*'` for all holders. */
  holderId: string;
  now: number;
  titleByPath: ReadonlyMap<string, string>;
  labelFor: (id: string) => string;
  query: string;
  enabledScopes: ReadonlySet<SearchScope> | readonly SearchScope[];
  sortMode: RowSort;
  viewOrder: ViewOrder;
}

export interface ViewRowsInput extends BaseRowsInput, DeriveViewInput {}

export interface ViewRowsResult {
  groups: ViewGroup[];
  /** Rows in scope (before search). */
  total: number;
  /** Rows matching the query (equals `total` when the query is empty). */
  matched: number;
  canDrag: boolean;
  /** Whether groups are per holder (All holders), even if search leaves only one. */
  grouped: boolean;
}

/** Drag reordering only makes sense in My order with no active search. */
export function canDragRows(sortMode: RowSort, query: string): boolean {
  return sortMode === 'mine' && query.trim() === '';
}

/** Stable identity of a delta within a ledger's history. */
export function historyKey(delta: RelationshipDelta): string {
  return `${delta.declaredIn.path}#${delta.declaredIn.ordinal}${delta.mirrored ? 'm' : ''}`;
}

function rowKey(ledger: Ledger): string {
  return `${ledger.track}|${ledger.holder}|${ledger.observer}`;
}

function colourFor(track: ResolvedTrack, value: TrackValue): string {
  if (track.kind === 'numeric') return scaleColourCss(valueColour(track, Number(value)));
  if (track.kind === 'ordinal') return scaleColourCss(rungColour(track, String(value)));
  return ACCENT_CSS;
}

function sortValueFor(track: ResolvedTrack, value: TrackValue): number | null {
  if (track.kind === 'numeric') return Number(value);
  if (track.kind === 'ordinal') return track.rungIndex(String(value));
  return Array.isArray(value) ? value.length : 0;
}

function searchableFor(
  base: Omit<BaseRow, 'searchable'>,
  track: ResolvedTrack,
  titleByPath: ReadonlyMap<string, string>,
): SearchableRow {
  const fields: SearchableRow['fields'] = { name: base.label };
  if (track.kind === 'numeric') fields.band = base.stateLabel ?? undefined;
  else if (track.kind === 'ordinal') fields.rung = base.stateLabel ?? undefined;
  else {
    const labels = track.labelFor(base.value);
    fields.tag = Array.isArray(labels) ? labels : [];
  }
  return {
    key: base.key,
    fields,
    history: base.ledger.deltas.map((d) => {
      const text = historyEntryText(d, titleByPath);
      return { key: historyKey(d), event: text.event, reason: text.reason };
    }),
  };
}

/** Stage 1: one base row per ledger, in input order. */
export function buildBaseRows(input: BaseRowsInput): BaseRow[] {
  const { track, now, titleByPath, labelFor } = input;
  return input.ledgers.map((ledger) => {
    const value = computeValue(ledger, track, now);
    const state = track.labelFor(value);
    const last = lastChange(ledger, now);
    const partial: Omit<BaseRow, 'searchable'> = {
      key: rowKey(ledger),
      holderId: ledger.holder,
      observerId: ledger.observer,
      label: labelFor(ledger.observer),
      ledger,
      value,
      formatted: track.format(value),
      stateLabel: typeof state === 'string' ? state : null,
      colour: colourFor(track, value),
      lastChange: last
        ? { delta: last.delta, at: last.at, dateLabel: formatEntryDate(last.at) }
        : null,
      entryCount: entryCount(ledger),
      onlyFuture:
        ledger.deltas.length > 0 && ledger.deltas.every((d) => d.at !== null && d.at > now),
      sortValue: sortValueFor(track, value),
    };
    return { ...partial, searchable: searchableFor(partial, track, titleByPath) };
  });
}

/** History entries (with running values) in `compareHistoryEntries` order. Only call for open rows. */
function buildHistory(
  base: BaseRow,
  track: ResolvedTrack,
  now: number,
  titleByPath: ReadonlyMap<string, string>,
  hits: ReadonlySet<string> | undefined,
): HistoryEntry[] {
  const { steps } = currentValue(base.ledger, track, now, { withSteps: true });
  return steps.map((step) => {
    const key = historyKey(step.delta);
    const text = historyEntryText(step.delta, titleByPath);
    return {
      key,
      at: step.delta.at,
      dateLabel: formatEntryDate(step.delta.at, { narrow: false }),
      delta: step.delta,
      runningValue: step.runningValue,
      runningFormatted: track.format(step.runningValue),
      applied: step.applied,
      mirrored: step.delta.mirrored === true,
      eventTitle: text.event ?? null,
      reason: text.reason ?? null,
      hit: hits ? hits.has(key) : null,
    };
  });
}

function compareLabels(labelFor: (id: string) => string, a: string, b: string): number {
  const la = labelFor(a).toLowerCase();
  const lb = labelFor(b).toLowerCase();
  if (la !== lb) return la < lb ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortGroupRows(
  track: ResolvedTrack,
  rows: readonly BaseRow[],
  sortMode: RowSort,
  order: readonly string[] | undefined,
): BaseRow[] {
  const byObserver = new Map(rows.map((r) => [r.observerId, r]));
  const sortable: SortableRow[] = rows.map((r) => ({
    key: r.observerId,
    label: r.label,
    value: r.sortValue,
    lastAt: r.lastChange?.at ?? null,
    entries: r.entryCount,
    band: track.kind === 'numeric' ? bandIndexFor(track, Number(r.value)) : null,
  }));
  return sortRows(sortable, sortMode, order ?? []).map((s) => byObserver.get(s.key) as BaseRow);
}

/** Stage 2: search, sort, group and open rows. */
export function deriveView(base: readonly BaseRow[], input: DeriveViewInput): ViewRowsResult {
  const { track, trackId, holderId, now, titleByPath, labelFor, query, sortMode, viewOrder } =
    input;

  const grouped = holderId === ALL_HOLDERS;

  const inScope = grouped ? base : base.filter((r) => r.holderId === holderId);
  const search: SearchResult = searchRows(
    inScope.map((r) => r.searchable),
    query,
    input.enabledScopes,
  );
  const visible = inScope.filter((r) => search.matchedKeys.has(r.key));

  const byHolder = new Map<string, BaseRow[]>();
  for (const r of visible) {
    const list = byHolder.get(r.holderId);
    if (list) list.push(r);
    else byHolder.set(r.holderId, [r]);
  }

  const holderIds = grouped
    ? applyOrder([...byHolder.keys()], viewOrder.order[groupListKey(trackId)], (a, b) =>
        compareLabels(labelFor, a, b),
      )
    : byHolder.has(holderId)
      ? [holderId]
      : [];
  const collapsedIds = new Set(viewOrder.collapsed[groupListKey(trackId)] ?? []);

  const groups: ViewGroup[] = holderIds.map((id) => {
    const listKey = rowListKey(trackId, id);
    const expandedIds = new Set(viewOrder.expanded[listKey] ?? []);
    const rows = sortGroupRows(
      track,
      byHolder.get(id) ?? [],
      sortMode,
      viewOrder.order[listKey],
    ).map((b): ViewRow => {
      const hits = search.historyHits.get(b.key);
      const expanded = expandedIds.has(b.observerId) || (hits !== undefined && hits.size > 0);
      return {
        key: b.key,
        listKey,
        holderId: b.holderId,
        observerId: b.observerId,
        label: b.label,
        ledger: b.ledger,
        value: b.value,
        formatted: b.formatted,
        stateLabel: b.stateLabel,
        colour: b.colour,
        lastChange: b.lastChange,
        entryCount: b.entryCount,
        onlyFuture: b.onlyFuture,
        expanded,
        history: expanded ? buildHistory(b, track, now, titleByPath, hits) : null,
      };
    });
    return {
      holderId: id,
      label: labelFor(id),
      listKey,
      collapsed: grouped && collapsedIds.has(id),
      rows,
    };
  });

  return {
    groups,
    total: search.total,
    matched: search.matched,
    canDrag: canDragRows(sortMode, query),
    grouped,
  };
}

/** Both stages in one call. `ledgers` are filtered to the track here. */
export function deriveViewRows(input: ViewRowsInput): ViewRowsResult {
  const base = buildBaseRows({
    ...input,
    ledgers: ledgersForHolder(input.ledgers, input.trackId, ALL_HOLDERS),
  });
  return deriveView(base, input);
}
