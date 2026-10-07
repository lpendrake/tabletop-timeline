import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  InvalidDirectiveEntry,
  Ledger,
  ResolvedTrack,
  TrackLibrary,
} from '../../../shared/relationships';
import { resolveTrack } from '../../../shared/relationships';
import type { EntityIndexEntry } from '../../../types/global';
import { timelinePort } from '../../timeline/data/ports';
import { CalendarProvider } from '../../timeline/calendar/provider';
import { deriveInGameNowSeconds } from '../../shared/in-game-now';
import { relationshipsData } from '../data';
import { viewOrderData } from '../view-order-data';
import { createSaveQueue } from '../view-order-save-queue';
import {
  loadSelectedHolder,
  loadSelectedTab,
  saveSelectedHolder,
  saveSelectedTab,
} from '../view-state-persistence';
import {
  asOfLabelFor,
  buildBaseRows,
  buildHolderPicker,
  buildTabs,
  countLabel,
  defaultViewOrder,
  deriveView,
  EMPTY_HOLDER_PICKER,
  emptyMessage,
  enabledScopesFor,
  moveInViewOrder,
  nextColumnSort,
  problemsForTrack,
  resolveActiveTab,
  resolveEntityLabel,
  resolveSortMode,
  scopeToggles,
  sortModeOptions,
  toggleDisabledScope,
  withToggledCollapsed,
  withToggledExpanded,
  groupListKey,
  type HolderPickerModel,
  type RowMove,
  type RowSort,
  type SortColumn,
  type SearchScope,
  type SortMode,
  type TrackTab,
  type ViewGroup,
  type ViewOrder,
} from '../domain';

export type { HistoryEntry, ViewGroup, ViewRow } from '../domain';

export interface UseRelationshipsOptions {
  campaignPath: string;
  library: TrackLibrary;
  entityLabelMap: Map<string, string>;
  getEntityIndex: () => EntityIndexEntry[];
}

export interface RelationshipsViewState {
  loaded: boolean;
  /** In-game now in epoch seconds; Infinity when unset. */
  now: number;
  asOfLabel: string | null;
  tabs: TrackTab[];
  activeTrackId: string | null;
  activeTrack: ResolvedTrack | null;
  selectTab(trackId: string): void;
  /** Every invalid entry (drafts are never reported by the index). */
  problems: InvalidDirectiveEntry[];
  /** Entries whose trackId is the active track. */
  trackProblems: InvalidDirectiveEntry[];
  holderPicker: HolderPickerModel;
  selectHolder(holderId: string): void;
  scopes: Array<{ scope: SearchScope; label: string; enabled: boolean }>;
  toggleScope(scope: SearchScope): void;
  query: string;
  setQuery(q: string): void;
  /** "3 of 15", only while a query is present. */
  countLabel: string | null;
  /** Set when a query matches nothing. */
  emptyMessage: string | null;
  sortModes: Array<{ mode: SortMode; label: string }>;
  sortMode: RowSort;
  setSortMode(m: SortMode): void;
  /** Click on a column title: cycles that column's sort, ending back at My order. */
  sortByColumn(column: SortColumn): void;
  /** One group (holderId = selected holder) for a single holder; several for All holders. */
  groups: ViewGroup[];
  /** True under All holders (group headers apply), even when search leaves a single group. */
  grouped: boolean;
  /** The list key ordering the All-holders groups (`<track>:*`); null without an active track. */
  groupsListKey: string | null;
  canDrag: boolean;
  toggleRow(listKey: string, observerId: string): void;
  toggleGroup(holderId: string): void;
  moveRow(listKey: string, id: string, to: RowMove): void;
  labelFor(id: string): string;
  entityIndex: EntityIndexEntry[] | null;
}

const SAVE_DEBOUNCE_MS = 300;
const NO_SCOPES: ReadonlySet<SearchScope> = new Set();

function createViewOrderQueue(campaignPath: string) {
  return createSaveQueue<ViewOrder>((state) => {
    void viewOrderData.save(campaignPath, state);
  }, SAVE_DEBOUNCE_MS);
}

export function useRelationships(options: UseRelationshipsOptions): RelationshipsViewState {
  const { campaignPath, library, entityLabelMap, getEntityIndex } = options;

  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [problems, setProblems] = useState<InvalidDirectiveEntry[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [defaultHolder, setDefaultHolder] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState<number>(Infinity);
  const [viewOrder, setViewOrder] = useState<ViewOrder>(defaultViewOrder());

  const [tabChoice, setTabChoice] = useState<{ campaignPath: string; id: string | null } | null>(
    null,
  );
  const [holderChoices, setHolderChoices] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [disabledScopes, setDisabledScopes] = useState<ReadonlySet<SearchScope>>(NO_SCOPES);
  const [sortChoice, setSortChoice] = useState<RowSort | null>(null);

  // ---- Data loading ----

  const reload = useCallback(async () => {
    const [nextLedgers, nextProblems, nextTitles] = await Promise.all([
      relationshipsData.getAllLedgers(),
      relationshipsData.getInvalid(),
      relationshipsData.getTitles(),
    ]);
    setLedgers(nextLedgers);
    setProblems(nextProblems);
    setTitles(nextTitles);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void reload();
    return relationshipsData.onChanged(() => void reload());
  }, [reload]);

  useEffect(() => {
    let active = true;
    void relationshipsData.getDefaultHolder().then((id) => {
      if (active) setDefaultHolder(id);
    });
    const unsubscribe = relationshipsData.onDefaultHolderChanged(setDefaultHolder);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    timelinePort.getState(campaignPath).then((state) => {
      if (!active) return;
      setNow(deriveInGameNowSeconds(state, CalendarProvider.get()));
    });
    return () => {
      active = false;
    };
  }, [campaignPath]);

  // ---- View order + expand/collapse persistence (relationships/view-order.json) ----

  const viewOrderLoadedRef = useRef(false);
  const saveQueueRef = useRef(createViewOrderQueue(campaignPath));

  useEffect(() => {
    viewOrderLoadedRef.current = false;
    let active = true;
    // A fresh queue per campaign: a pending write from the previous campaign's
    // queue would otherwise fire against the new campaignPath.
    saveQueueRef.current = createViewOrderQueue(campaignPath);
    void viewOrderData.load(campaignPath).then((loadedOrder) => {
      if (!active) return;
      setViewOrder(loadedOrder);
      viewOrderLoadedRef.current = true;
    });
    return () => {
      active = false;
      saveQueueRef.current.flush();
    };
  }, [campaignPath]);

  useEffect(() => {
    if (!viewOrderLoadedRef.current) return;
    saveQueueRef.current.schedule(viewOrder);
  }, [viewOrder]);

  // ---- Derivations (pure logic lives in domain/) ----

  const labelFor = useCallback(
    (id: string) => resolveEntityLabel(id, entityLabelMap, getEntityIndex()),
    [entityLabelMap, getEntityIndex],
  );
  const titleByPath = useMemo(() => new Map(Object.entries(titles)), [titles]);

  const tabs = useMemo(
    () => buildTabs({ library, ledgers, invalid: problems }),
    [library, ledgers, problems],
  );
  const savedTab =
    tabChoice && tabChoice.campaignPath === campaignPath
      ? tabChoice.id
      : loadSelectedTab(campaignPath);
  const activeTrackId = resolveActiveTab(tabs, savedTab);
  const activeTrack = useMemo(
    () => (activeTrackId ? resolveTrack(activeTrackId, library) : null),
    [activeTrackId, library],
  );
  const kind = activeTrack?.kind ?? null;

  const holderPicker = useMemo(
    () =>
      activeTrackId && kind
        ? buildHolderPicker({
            kind,
            trackId: activeTrackId,
            ledgers,
            defaultHolderId: defaultHolder,
            savedHolderId:
              holderChoices[activeTrackId] ?? loadSelectedHolder(campaignPath, activeTrackId),
            labelFor,
          })
        : EMPTY_HOLDER_PICKER,
    [activeTrackId, kind, ledgers, defaultHolder, holderChoices, campaignPath, labelFor],
  );

  const sortMode = resolveSortMode(kind ?? 'numeric', sortChoice);

  const baseRows = useMemo(
    () =>
      activeTrack && activeTrackId
        ? buildBaseRows({
            ledgers: ledgers.filter((l) => l.track === activeTrackId),
            track: activeTrack,
            trackId: activeTrackId,
            now,
            titleByPath,
            labelFor,
          })
        : [],
    [ledgers, activeTrack, activeTrackId, now, titleByPath, labelFor],
  );

  const view = useMemo(
    () =>
      activeTrack && activeTrackId
        ? deriveView(baseRows, {
            track: activeTrack,
            trackId: activeTrackId,
            holderId: holderPicker.selectedId,
            now,
            titleByPath,
            labelFor,
            query,
            enabledScopes: enabledScopesFor(activeTrack.kind, disabledScopes),
            sortMode,
            viewOrder,
          })
        : { groups: [], total: 0, matched: 0, canDrag: false, grouped: false },
    [
      baseRows,
      activeTrack,
      activeTrackId,
      holderPicker.selectedId,
      now,
      titleByPath,
      labelFor,
      query,
      disabledScopes,
      sortMode,
      viewOrder,
    ],
  );

  const groupsRef = useRef<ViewGroup[]>(view.groups);
  groupsRef.current = view.groups;

  const hasQuery = query.trim() !== '';
  const anyScopeDisabled = disabledScopes.size > 0;

  return {
    loaded,
    now,
    asOfLabel: asOfLabelFor(now),
    tabs,
    activeTrackId,
    activeTrack,
    selectTab: (trackId) => {
      setTabChoice({ campaignPath, id: trackId });
      saveSelectedTab(campaignPath, trackId);
      setQuery('');
      setDisabledScopes(NO_SCOPES);
      setSortChoice(null);
    },
    problems,
    trackProblems: problemsForTrack(problems, activeTrackId),
    holderPicker,
    selectHolder: (holderId) => {
      if (!activeTrackId) return;
      setHolderChoices((prev) => ({ ...prev, [activeTrackId]: holderId }));
      saveSelectedHolder(campaignPath, activeTrackId, holderId);
    },
    scopes: kind && activeTrack ? scopeToggles(kind, activeTrack.name, disabledScopes) : [],
    toggleScope: (scope) => setDisabledScopes((prev) => toggleDisabledScope(prev, scope)),
    query,
    setQuery,
    countLabel: hasQuery ? countLabel(view.matched, view.total) : null,
    emptyMessage:
      hasQuery && view.total > 0 && view.matched === 0
        ? emptyMessage(query, anyScopeDisabled)
        : null,
    sortModes: sortModeOptions(kind ?? 'numeric'),
    sortMode,
    setSortMode: setSortChoice,
    sortByColumn: (column) => setSortChoice(nextColumnSort(sortMode, column)),
    groups: view.groups,
    grouped: view.grouped,
    groupsListKey: activeTrackId ? groupListKey(activeTrackId) : null,
    canDrag: view.canDrag,
    toggleRow: (listKey, observerId) =>
      setViewOrder((prev) => withToggledExpanded(prev, listKey, observerId)),
    toggleGroup: (holderId) => {
      if (!activeTrackId) return;
      setViewOrder((prev) => withToggledCollapsed(prev, groupListKey(activeTrackId), holderId));
    },
    moveRow: (listKey, id, to) => {
      if (!activeTrackId) return;
      setViewOrder((prev) =>
        moveInViewOrder(prev, groupsRef.current, activeTrackId, listKey, id, to),
      );
    },
    labelFor,
    entityIndex: getEntityIndex(),
  };
}
