import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  InvalidDirectiveEntry,
  Ledger,
  ParsedDirective,
  TrackLibrary,
} from '../../../shared/relationships';
import { EMPTY_TRACK_LIBRARY, listTracks, resolveTrack } from '../../../shared/relationships';
import type { EntityIndexEntry } from '../../../types/global';
import { timelinePort } from '../../timeline/data/ports';
import { CalendarProvider } from '../../timeline/calendar/provider';
import { deriveInGameNowSeconds } from '../../shared/in-game-now';
import { relationshipsData } from '../data';
import { viewOrderData } from '../view-order-data';
import {
  applyViewOrderToRows,
  createValueCache,
  expandedIdsForMode,
  flatKeysFromExpandedIds,
  groupRelationships,
  innerRowStateKey,
  moveAfter,
  moveBefore,
  moveDown,
  moveToTop,
  moveUp,
  outerRowStateKey,
  pathsNeededForExpandedTracks,
  resolveEntityLabel,
  toggleInSet,
  withoutPaths,
  type DropTarget,
  type GroupingMode,
  type InnerRow,
  type OuterRow,
  type RowDragPayload,
  type TrackRow,
  type ValueCache,
  type ViewOrder,
} from '../domain';

export interface ParsedFileEntry {
  title?: string;
  directives: ParsedDirective[];
}

export interface UseRelationshipsOptions {
  campaignPath: string;
  entityLabelMap: Map<string, string>;
  getEntityIndex: () => EntityIndexEntry[];
}

export interface UseRelationshipsResult {
  mode: GroupingMode;
  toggleMode: () => void;
  rows: OuterRow[];
  problems: InvalidDirectiveEntry[];
  now: number;
  cache: ValueCache;
  labelFor: (id: string) => string;
  entityIndex: EntityIndexEntry[];
  isOuterExpanded: (row: OuterRow) => boolean;
  toggleOuter: (row: OuterRow) => void;
  isInnerExpanded: (outer: OuterRow, inner: InnerRow) => boolean;
  toggleInner: (outer: OuterRow, inner: InnerRow) => void;
  isTrackExpanded: (row: TrackRow) => boolean;
  toggleTrack: (row: TrackRow) => void;
  directivesFor: (path: string) => ParsedFileEntry | undefined;
  // User ordering (drag-and-drop + context menu), persisted with collapse state.
  moveRowToTop: (payload: RowDragPayload) => void;
  moveRowUp: (payload: RowDragPayload) => void;
  moveRowDown: (payload: RowDragPayload) => void;
  moveRowBefore: (payload: RowDragPayload, targetId: string) => void;
  moveRowAfter: (payload: RowDragPayload, targetId: string) => void;
}

const SAVE_DEBOUNCE_MS = 300;

export function useRelationships(options: UseRelationshipsOptions): UseRelationshipsResult {
  const { campaignPath, entityLabelMap, getEntityIndex } = options;

  const [tracks, setTracks] = useState<TrackLibrary>(EMPTY_TRACK_LIBRARY);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [problems, setProblems] = useState<InvalidDirectiveEntry[]>([]);
  const [mode, setMode] = useState<GroupingMode>('holder');
  const [now, setNow] = useState<number>(Infinity);
  const [directivesCache, setDirectivesCache] = useState<Record<string, ParsedFileEntry>>({});

  const [expandedOuter, setExpandedOuter] = useState<ReadonlySet<string>>(new Set());
  const [expandedInner, setExpandedInner] = useState<ReadonlySet<string>>(new Set());
  const [expandedTrack, setExpandedTrack] = useState<ReadonlySet<string>>(new Set());
  const [order, setOrder] = useState<Record<GroupingMode, Record<string, string[]>>>({
    holder: {},
    observer: {},
  });

  const cacheRef = useRef<ValueCache | null>(null);
  if (!cacheRef.current) cacheRef.current = createValueCache();
  const cache = cacheRef.current;

  const reload = useCallback(async () => {
    const [nextTracks, nextLedgers, nextProblems] = await Promise.all([
      relationshipsData.getTracks(),
      relationshipsData.getAllLedgers(),
      relationshipsData.getInvalid(),
    ]);
    setTracks(nextTracks);
    setLedgers(nextLedgers);
    setProblems(nextProblems);
  }, []);

  useEffect(() => {
    void reload();
    const unsubscribe = relationshipsData.onChanged(({ paths }) => {
      if (paths.length > 0) {
        setDirectivesCache((prev) => withoutPaths(prev, paths));
      }
      void reload();
    });
    return unsubscribe;
  }, [reload]);

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

  // ---- View order + collapse-state persistence (relationships/view-order.json) ----

  const loadedRef = useRef(false);
  const pendingSaveRef = useRef<ViewOrder | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPendingSave = useCallback((path: string) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingSaveRef.current;
    if (pending) {
      pendingSaveRef.current = null;
      void viewOrderData.save(path, pending);
    }
  }, []);

  useEffect(() => {
    loadedRef.current = false;
    let active = true;
    viewOrderData.load(campaignPath).then((loaded) => {
      if (!active) return;
      setOrder({ holder: loaded.holder.order, observer: loaded.observer.order });
      setExpandedOuter(
        new Set([
          ...flatKeysFromExpandedIds('holder', loaded.holder.expanded.outer),
          ...flatKeysFromExpandedIds('observer', loaded.observer.expanded.outer),
        ]),
      );
      setExpandedInner(
        new Set([
          ...flatKeysFromExpandedIds('holder', loaded.holder.expanded.inner),
          ...flatKeysFromExpandedIds('observer', loaded.observer.expanded.inner),
        ]),
      );
      setExpandedTrack(
        new Set([...loaded.holder.expanded.track, ...loaded.observer.expanded.track]),
      );
      loadedRef.current = true;
    });
    return () => {
      active = false;
      // Flush any pending debounced write for the campaign we're leaving.
      flushPendingSave(campaignPath);
    };
  }, [campaignPath, flushPendingSave]);

  useEffect(() => {
    if (!loadedRef.current) return;
    const toSave: ViewOrder = {
      version: 1,
      holder: {
        order: order.holder,
        expanded: {
          outer: expandedIdsForMode('holder', expandedOuter),
          inner: expandedIdsForMode('holder', expandedInner),
          track: Array.from(expandedTrack),
        },
      },
      observer: {
        order: order.observer,
        expanded: {
          outer: expandedIdsForMode('observer', expandedOuter),
          inner: expandedIdsForMode('observer', expandedInner),
          track: Array.from(expandedTrack),
        },
      },
    };
    pendingSaveRef.current = toSave;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      const pending = pendingSaveRef.current;
      pendingSaveRef.current = null;
      if (pending) void viewOrderData.save(campaignPath, pending);
    }, SAVE_DEBOUNCE_MS);
    // No cleanup here: the timer is re-armed on the next relevant change and
    // flushed explicitly on unmount / campaign change (see the effect above).
  }, [order, expandedOuter, expandedInner, expandedTrack, campaignPath]);

  const labelFor = useCallback(
    (id: string) => resolveEntityLabel(id, entityLabelMap, getEntityIndex()),
    [entityLabelMap, getEntityIndex],
  );

  const resolveTrackFn = useCallback((id: string) => resolveTrack(id, tracks), [tracks]);
  const trackOrder = useMemo(() => listTracks(tracks).map((t) => t.id), [tracks]);

  const groupedRows = useMemo(
    () => groupRelationships(ledgers, mode, { resolveTrack: resolveTrackFn, trackOrder, labelFor }),
    [ledgers, mode, resolveTrackFn, trackOrder, labelFor],
  );

  const rows = useMemo(
    () => applyViewOrderToRows(groupedRows, order[mode], labelFor),
    [groupedRows, order, mode, labelFor],
  );

  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // Fetch directives only for the paths behind currently expanded track rows.
  useEffect(() => {
    const isExpanded = (row: TrackRow) => expandedTrack.has(row.key);
    const needed = pathsNeededForExpandedTracks(rows, isExpanded, now, cache);
    const missing = needed.filter((path) => !(path in directivesCache));
    if (missing.length === 0) return;

    let active = true;
    relationshipsData.getDirectives(missing).then((results) => {
      if (!active) return;
      setDirectivesCache((prev) => {
        const next = { ...prev };
        for (const entry of results) {
          next[entry.path] = { title: entry.title, directives: entry.directives };
        }
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, [rows, expandedTrack, now, cache, directivesCache]);

  const directivesFor = useCallback((path: string) => directivesCache[path], [directivesCache]);

  const visibleSiblings = useCallback((payload: RowDragPayload | DropTarget): string[] => {
    if (payload.level === 'outer') return rowsRef.current.map((r) => r.key);
    const outer = rowsRef.current.find((r) => r.key === payload.parentKey);
    return outer ? outer.children.map((c) => c.key) : [];
  }, []);

  const setOrderForParent = useCallback(
    (rowMode: GroupingMode, parentKey: string, ids: string[]) => {
      setOrder((prev) => ({
        ...prev,
        [rowMode]: { ...prev[rowMode], [parentKey]: ids },
      }));
    },
    [],
  );

  const moveRowToTop = useCallback(
    (payload: RowDragPayload) => {
      const visible = visibleSiblings(payload);
      setOrderForParent(payload.mode, payload.parentKey, moveToTop(visible, payload.id));
    },
    [visibleSiblings, setOrderForParent],
  );

  const moveRowUp = useCallback(
    (payload: RowDragPayload) => {
      const visible = visibleSiblings(payload);
      setOrderForParent(payload.mode, payload.parentKey, moveUp(visible, payload.id));
    },
    [visibleSiblings, setOrderForParent],
  );

  const moveRowDown = useCallback(
    (payload: RowDragPayload) => {
      const visible = visibleSiblings(payload);
      setOrderForParent(payload.mode, payload.parentKey, moveDown(visible, payload.id));
    },
    [visibleSiblings, setOrderForParent],
  );

  const moveRowBefore = useCallback(
    (payload: RowDragPayload, targetId: string) => {
      const visible = visibleSiblings(payload);
      setOrderForParent(payload.mode, payload.parentKey, moveBefore(visible, payload.id, targetId));
    },
    [visibleSiblings, setOrderForParent],
  );

  const moveRowAfter = useCallback(
    (payload: RowDragPayload, targetId: string) => {
      const visible = visibleSiblings(payload);
      setOrderForParent(payload.mode, payload.parentKey, moveAfter(visible, payload.id, targetId));
    },
    [visibleSiblings, setOrderForParent],
  );

  return {
    mode,
    toggleMode: () => setMode((m) => (m === 'holder' ? 'observer' : 'holder')),
    rows,
    problems,
    now,
    cache,
    labelFor,
    entityIndex: getEntityIndex(),
    isOuterExpanded: (row) => expandedOuter.has(outerRowStateKey(mode, row)),
    toggleOuter: (row) =>
      setExpandedOuter((prev) => toggleInSet(prev, outerRowStateKey(mode, row))),
    isInnerExpanded: (outer, inner) => expandedInner.has(innerRowStateKey(mode, outer, inner)),
    toggleInner: (outer, inner) =>
      setExpandedInner((prev) => toggleInSet(prev, innerRowStateKey(mode, outer, inner))),
    isTrackExpanded: (row) => expandedTrack.has(row.key),
    toggleTrack: (row) => setExpandedTrack((prev) => toggleInSet(prev, row.key)),
    directivesFor,
    moveRowToTop,
    moveRowUp,
    moveRowDown,
    moveRowBefore,
    moveRowAfter,
  };
}
