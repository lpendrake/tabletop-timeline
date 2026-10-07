/**
 * Pure derivations behind `useRelationships`: the holder picker model, scope
 * toggles, sort-mode options, problems per track, and applying a row move to
 * the persisted view order. No IO, no React — the hook only wires these to
 * React state.
 */
import type { InvalidDirectiveEntry, Ledger, TrackKind } from '../../../shared/relationships';
import { formatEntryDate } from './entry-date';
import {
  ALL_HOLDERS,
  allLabel,
  holdersForTrack,
  pickerLabel,
  pinnedHolders,
  resolveSelectedHolder,
  showHolderPicker,
  type HolderEntry,
} from './holders';
import { scopeLabel, scopesForKind, type SearchScope } from './search';
import { isColumnSort, sortLabel, sortModesForKind, type RowSort, type SortMode } from './sort';
import {
  applyRowMove,
  groupListKey,
  withListOrder,
  type RowMove,
  type ViewOrder,
} from './view-order';
import type { ViewGroup } from './view-rows';

export interface HolderPickerModel {
  show: boolean;
  label: string;
  allLabel: string;
  holders: HolderEntry[];
  pinned: HolderEntry[];
  selectedId: string;
  selectedCount: number;
}

/** The picker model for one track, resolving the saved selection against the holders present. */
export function buildHolderPicker(input: {
  kind: TrackKind;
  trackId: string;
  ledgers: readonly Ledger[];
  defaultHolderId: string | null;
  savedHolderId: string | null;
  labelFor: (id: string) => string;
}): HolderPickerModel {
  const { kind, trackId, ledgers, defaultHolderId, savedHolderId, labelFor } = input;
  const holders = holdersForTrack(ledgers, trackId, labelFor);
  const total = holders.reduce((sum, h) => sum + h.count, 0);
  const selectedId = resolveSelectedHolder(savedHolderId, holders, defaultHolderId);
  return {
    show: showHolderPicker(holders),
    label: pickerLabel(kind),
    allLabel: allLabel(kind),
    holders,
    pinned: pinnedHolders({ kind, total, defaultHolderId, holders }),
    selectedId,
    selectedCount:
      selectedId === ALL_HOLDERS ? total : (holders.find((h) => h.id === selectedId)?.count ?? 0),
  };
}

/** The empty picker model used when there is no active track. */
export const EMPTY_HOLDER_PICKER: HolderPickerModel = {
  show: false,
  label: 'Holder',
  allLabel: 'All holders',
  holders: [],
  pinned: [],
  selectedId: ALL_HOLDERS,
  selectedCount: 0,
};

/** Scopes enabled for a kind, given the scopes the user has switched off. */
export function enabledScopesFor(
  kind: TrackKind,
  disabled: ReadonlySet<SearchScope>,
): SearchScope[] {
  return scopesForKind(kind).filter((s) => !disabled.has(s));
}

/** Toggle model for the scope chips. */
export function scopeToggles(
  kind: TrackKind,
  trackName: string,
  disabled: ReadonlySet<SearchScope>,
): Array<{ scope: SearchScope; label: string; enabled: boolean }> {
  return scopesForKind(kind).map((scope) => ({
    scope,
    label: scopeLabel(scope, trackName),
    enabled: !disabled.has(scope),
  }));
}

/** A new disabled-set with `scope` flipped. */
export function toggleDisabledScope(
  disabled: ReadonlySet<SearchScope>,
  scope: SearchScope,
): Set<SearchScope> {
  const next = new Set(disabled);
  if (next.has(scope)) next.delete(scope);
  else next.add(scope);
  return next;
}

export function sortModeOptions(kind: TrackKind): Array<{ mode: SortMode; label: string }> {
  return sortModesForKind(kind).map((mode) => ({ mode, label: sortLabel(mode) }));
}

/**
 * The chosen sort if the kind offers it, else the kind's default. Numeric
 * tracks accept My order or any column sort and default to My order; other
 * kinds accept their listed modes and default to the first.
 */
export function resolveSortMode(kind: TrackKind, chosen: RowSort | null): RowSort {
  const modes = sortModesForKind(kind);
  if (chosen === null) return kind === 'numeric' ? 'mine' : modes[0];
  if (kind === 'numeric') return chosen === 'mine' || isColumnSort(chosen) ? chosen : 'mine';
  return !isColumnSort(chosen) && modes.includes(chosen) ? chosen : modes[0];
}

/** Entries whose envelope names `trackId`. */
export function problemsForTrack(
  invalid: readonly InvalidDirectiveEntry[],
  trackId: string | null,
): InvalidDirectiveEntry[] {
  return trackId ? invalid.filter((e) => e.trackId === trackId) : [];
}

/** The "as of" caption for the in-game date, or null when no date is set. */
export function asOfLabelFor(now: number): string | null {
  return Number.isFinite(now) ? formatEntryDate(now) : null;
}

/** The ids currently shown for `listKey`: holder ids for a group list, else that group's observer ids. */
export function visibleIdsForList(
  groups: readonly ViewGroup[],
  trackId: string,
  listKey: string,
): string[] {
  if (listKey === groupListKey(trackId)) return groups.map((g) => g.holderId);
  const group = groups.find((g) => g.listKey === listKey);
  return group ? group.rows.map((r) => r.observerId) : [];
}

/** Applies a row move: rewrites `listKey`'s list as the moved visible order plus preserved stale ids. */
export function moveInViewOrder(
  viewOrder: ViewOrder,
  groups: readonly ViewGroup[],
  trackId: string,
  listKey: string,
  id: string,
  to: RowMove,
): ViewOrder {
  const visible = visibleIdsForList(groups, trackId, listKey);
  return withListOrder(viewOrder, listKey, applyRowMove(visible, id, to));
}
