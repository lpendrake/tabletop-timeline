import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Ledger, ParsedDirective, TrackLibrary } from '../../../shared/relationships';
import { listTracks, resolveTrack } from '../../../shared/relationships';
import type { InvalidDirectiveEntry } from '../../../main/relationships-store';
import type { EntityIndexEntry } from '../../../types/global';
import { timelinePort } from '../../timeline/data/ports';
import { CalendarProvider } from '../../timeline/calendar/provider';
import { deriveInGameNowSeconds } from '../../shared/in-game-now';
import { relationshipsData } from '../data';
import {
  createValueCache,
  groupRelationships,
  innerRowStateKey,
  outerRowStateKey,
  pathsNeededForExpandedTracks,
  toggleInSet,
  type GroupingMode,
  type InnerRow,
  type OuterRow,
  type TrackRow,
  type ValueCache,
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
}

const EMPTY_LIBRARY: TrackLibrary = { custom: [], optionAdditions: {} };

export function useRelationships(options: UseRelationshipsOptions): UseRelationshipsResult {
  const { campaignPath, entityLabelMap, getEntityIndex } = options;

  const [tracks, setTracks] = useState<TrackLibrary>(EMPTY_LIBRARY);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [problems, setProblems] = useState<InvalidDirectiveEntry[]>([]);
  const [mode, setMode] = useState<GroupingMode>('holder');
  const [now, setNow] = useState<number>(Infinity);
  const [directivesCache, setDirectivesCache] = useState<Record<string, ParsedFileEntry>>({});

  const [expandedOuter, setExpandedOuter] = useState<ReadonlySet<string>>(new Set());
  const [expandedInner, setExpandedInner] = useState<ReadonlySet<string>>(new Set());
  const [expandedTrack, setExpandedTrack] = useState<ReadonlySet<string>>(new Set());

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
        setDirectivesCache((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const path of paths) {
            if (path in next) {
              delete next[path];
              changed = true;
            }
          }
          return changed ? next : prev;
        });
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

  const labelFor = useCallback((id: string) => entityLabelMap.get(id) ?? id, [entityLabelMap]);

  const resolveTrackFn = useCallback((id: string) => resolveTrack(id, tracks), [tracks]);
  const trackOrder = useMemo(() => listTracks(tracks).map((t) => t.id), [tracks]);

  const rows = useMemo(
    () => groupRelationships(ledgers, mode, { resolveTrack: resolveTrackFn, trackOrder, labelFor }),
    [ledgers, mode, resolveTrackFn, trackOrder, labelFor],
  );

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
  };
}
