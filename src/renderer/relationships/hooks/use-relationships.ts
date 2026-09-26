import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  InvalidDirectiveEntry,
  Ledger,
  ParsedDirective,
  TrackLibrary,
} from '../../../shared/relationships';
import { listTracks, resolveTrack } from '../../../shared/relationships';
import type { EntityIndexEntry } from '../../../types/global';
import { timelinePort } from '../../timeline/data/ports';
import { CalendarProvider } from '../../timeline/calendar/provider';
import { deriveInGameNowSeconds } from '../../shared/in-game-now';
import { relationshipsData } from '../data';
import { viewOrderData } from '../view-order-data';
import { createSaveQueue } from '../view-order-save-queue';
import {
  applyViewOrderToRows,
  buildViewOrder,
  groupRelationships,
  hydrateViewOrder,
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
  type ViewOrderState,
} from '../domain';

export interface ParsedFileEntry {
  title?: string;
  directives: ParsedDirective[];
}

export interface UseRelationshipsOptions {
  campaignPath: string;
  library: TrackLibrary;
  entityLabelMap: Map<string, string>;
  getEntityIndex: () => EntityIndexEntry[];
}

export interface UseRelationshipsResult {
  mode: GroupingMode;
  toggleMode: () => void;
  rows: OuterRow[];
  problems: InvalidDirectiveEntry[];
  now: number;
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

const EMPTY_MODE_SET: Record<GroupingMode, ReadonlySet<string>> = {
  holder: new Set(),
  observer: new Set(),
};

function emptyViewOrderState(): ViewOrderState {
  return {
    order: { holder: {}, observer: {} },
    expandedOuter: EMPTY_MODE_SET,
    expandedInner: EMPTY_MODE_SET,
    expandedTrack: new Set(),
  };
}

export function useRelationships(options: UseRelationshipsOptions): UseRelationshipsResult {
  const { campaignPath, library, entityLabelMap, getEntityIndex } = options;

  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [problems, setProblems] = useState<InvalidDirectiveEntry[]>([]);
  const [mode, setMode] = useState<GroupingMode>('holder');
  const [now, setNow] = useState<number>(Infinity);
  const [directivesCache, setDirectivesCache] = useState<Record<string, ParsedFileEntry>>({});

  const [viewOrderState, setViewOrderState] = useState<ViewOrderState>(emptyViewOrderState());

  const reload = useCallback(async () => {
    const [nextLedgers, nextProblems] = await Promise.all([
      relationshipsData.getAllLedgers(),
      relationshipsData.getInvalid(),
    ]);
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
  const saveQueueRef = useRef(
    createSaveQueue<ViewOrderState>((state) => {
      void viewOrderData.save(campaignPath, buildViewOrder(state));
    }, SAVE_DEBOUNCE_MS),
  );

  useEffect(() => {
    loadedRef.current = false;
    let active = true;
    // A fresh queue per campaign: any pending write from the previous
    // campaign's queue would otherwise fire against the new campaignPath.
    saveQueueRef.current = createSaveQueue<ViewOrderState>((state) => {
      void viewOrderData.save(campaignPath, buildViewOrder(state));
    }, SAVE_DEBOUNCE_MS);
    viewOrderData.load(campaignPath).then((loaded) => {
      if (!active) return;
      setViewOrderState(hydrateViewOrder(loaded));
      loadedRef.current = true;
    });
    return () => {
      active = false;
      // Flush any pending debounced write for the campaign we're leaving.
      saveQueueRef.current.flush();
    };
  }, [campaignPath]);

  useEffect(() => {
    if (!loadedRef.current) return;
    saveQueueRef.current.schedule(viewOrderState);
    // No cleanup here: the queue re-arms on the next relevant change and is
    // flushed explicitly on unmount / campaign change (see the effect above).
  }, [viewOrderState]);

  const labelFor = useCallback(
    (id: string) => resolveEntityLabel(id, entityLabelMap, getEntityIndex()),
    [entityLabelMap, getEntityIndex],
  );

  const resolveTrackFn = useCallback((id: string) => resolveTrack(id, library), [library]);
  const trackOrder = useMemo(() => listTracks(library).map((t) => t.id), [library]);

  const groupedRows = useMemo(
    () => groupRelationships(ledgers, mode, { resolveTrack: resolveTrackFn, trackOrder, labelFor }),
    [ledgers, mode, resolveTrackFn, trackOrder, labelFor],
  );

  const rows = useMemo(
    () => applyViewOrderToRows(groupedRows, viewOrderState.order[mode], labelFor),
    [groupedRows, viewOrderState.order, mode, labelFor],
  );

  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // Fetch directives only for the paths behind currently expanded track rows.
  useEffect(() => {
    const isExpanded = (row: TrackRow) => viewOrderState.expandedTrack.has(row.key);
    const needed = pathsNeededForExpandedTracks(rows, isExpanded, now);
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
  }, [rows, viewOrderState.expandedTrack, now, directivesCache]);

  const directivesFor = useCallback((path: string) => directivesCache[path], [directivesCache]);

  const visibleSiblings = useCallback((payload: RowDragPayload | DropTarget): string[] => {
    if (payload.level === 'outer') return rowsRef.current.map((r) => r.key);
    const outer = rowsRef.current.find((r) => r.key === payload.parentKey);
    return outer ? outer.children.map((c) => c.key) : [];
  }, []);

  /** Applies one of the pure `view-order` move functions to the payload's
   * visible siblings and writes the result back for its (mode, parentKey). */
  const applyMove = useCallback(
    (payload: RowDragPayload, fn: (visible: string[], id: string) => string[]) => {
      const visible = visibleSiblings(payload);
      const nextIds = fn(visible, payload.id);
      setViewOrderState((prev) => ({
        ...prev,
        order: {
          ...prev.order,
          [payload.mode]: { ...prev.order[payload.mode], [payload.parentKey]: nextIds },
        },
      }));
    },
    [visibleSiblings],
  );

  const applyMoveWithTarget = useCallback(
    (
      payload: RowDragPayload,
      targetId: string,
      fn: (visible: string[], id: string, targetId: string) => string[],
    ) => {
      applyMove(payload, (visible, id) => fn(visible, id, targetId));
    },
    [applyMove],
  );

  const toggleOuterExpanded = useCallback(
    (row: OuterRow) => {
      setViewOrderState((prev) => ({
        ...prev,
        expandedOuter: {
          ...prev.expandedOuter,
          [mode]: toggleInSet(prev.expandedOuter[mode], outerRowStateKey(row)),
        },
      }));
    },
    [mode],
  );

  const toggleInnerExpanded = useCallback(
    (outer: OuterRow, inner: InnerRow) => {
      setViewOrderState((prev) => ({
        ...prev,
        expandedInner: {
          ...prev.expandedInner,
          [mode]: toggleInSet(prev.expandedInner[mode], innerRowStateKey(outer, inner)),
        },
      }));
    },
    [mode],
  );

  const toggleTrackExpanded = useCallback((row: TrackRow) => {
    setViewOrderState((prev) => ({
      ...prev,
      expandedTrack: toggleInSet(prev.expandedTrack, row.key),
    }));
  }, []);

  return {
    mode,
    toggleMode: () => setMode((m) => (m === 'holder' ? 'observer' : 'holder')),
    rows,
    problems,
    now,
    labelFor,
    entityIndex: getEntityIndex(),
    isOuterExpanded: (row) => viewOrderState.expandedOuter[mode].has(outerRowStateKey(row)),
    toggleOuter: toggleOuterExpanded,
    isInnerExpanded: (outer, inner) =>
      viewOrderState.expandedInner[mode].has(innerRowStateKey(outer, inner)),
    toggleInner: toggleInnerExpanded,
    isTrackExpanded: (row) => viewOrderState.expandedTrack.has(row.key),
    toggleTrack: toggleTrackExpanded,
    directivesFor,
    moveRowToTop: (payload) => applyMove(payload, moveToTop),
    moveRowUp: (payload) => applyMove(payload, moveUp),
    moveRowDown: (payload) => applyMove(payload, moveDown),
    moveRowBefore: (payload, targetId) => applyMoveWithTarget(payload, targetId, moveBefore),
    moveRowAfter: (payload, targetId) => applyMoveWithTarget(payload, targetId, moveAfter),
  };
}
