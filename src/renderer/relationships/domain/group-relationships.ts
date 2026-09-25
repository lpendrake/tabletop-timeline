/**
 * Groups a flat list of relationship ledgers into the two-level (outer/inner)
 * shape the Relationships view renders: by holder (default) or by observer.
 * Pure — no IO, no React.
 */

import type { Ledger } from '../../../shared/relationships/model';
import type { ResolvedTrack } from '../../../shared/relationships/resolve';

export type GroupingMode = 'holder' | 'observer';

export interface TrackRow {
  /** Mode-independent identity: the same relationship reads identically under either grouping. */
  key: string;
  ledger: Ledger;
  track: ResolvedTrack | null;
  trackId: string;
}

export interface InnerRow {
  key: string;
  entityId: string;
  holder: string;
  observer: string;
  tracks: TrackRow[];
}

export interface OuterRow {
  key: string;
  entityId: string;
  children: InnerRow[];
}

export interface GroupRelationshipsOptions {
  resolveTrack: (id: string) => ResolvedTrack | null;
  trackOrder: string[];
  labelFor: (id: string) => string;
}

/** Case-insensitive label compare, falling back to id for a stable tie-break. */
export function compareEntitiesByLabel(
  labelFor: (id: string) => string,
  a: string,
  b: string,
): number {
  const la = labelFor(a).toLowerCase();
  const lb = labelFor(b).toLowerCase();
  if (la !== lb) return la < lb ? -1 : 1;
  if (a !== b) return a < b ? -1 : 1;
  return 0;
}

function trackOrderIndex(trackId: string, trackOrder: string[]): number {
  const index = trackOrder.indexOf(trackId);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

/** Orders tracks within an inner row by track-library order; unknown tracks last, by id. */
export function compareTrackRows(trackOrder: string[], a: TrackRow, b: TrackRow): number {
  const ai = trackOrderIndex(a.trackId, trackOrder);
  const bi = trackOrderIndex(b.trackId, trackOrder);
  if (ai !== bi) return ai - bi;
  if (a.trackId !== b.trackId) return a.trackId < b.trackId ? -1 : 1;
  return 0;
}

function trackRowKey(ledger: Ledger): string {
  return `${ledger.holder}|${ledger.observer}|${ledger.track}`;
}

export function groupRelationships(
  ledgers: Ledger[],
  mode: GroupingMode,
  opts: GroupRelationshipsOptions,
): OuterRow[] {
  const outerOf = (l: Ledger) => (mode === 'holder' ? l.holder : l.observer);
  const innerOf = (l: Ledger) => (mode === 'holder' ? l.observer : l.holder);

  const outerMap = new Map<string, Map<string, TrackRow[]>>();

  for (const ledger of ledgers) {
    const outerId = outerOf(ledger);
    const innerId = innerOf(ledger);

    let innerMap = outerMap.get(outerId);
    if (!innerMap) {
      innerMap = new Map();
      outerMap.set(outerId, innerMap);
    }

    let rows = innerMap.get(innerId);
    if (!rows) {
      rows = [];
      innerMap.set(innerId, rows);
    }

    rows.push({
      key: trackRowKey(ledger),
      ledger,
      track: opts.resolveTrack(ledger.track),
      trackId: ledger.track,
    });
  }

  const outerIds = Array.from(outerMap.keys()).sort((a, b) =>
    compareEntitiesByLabel(opts.labelFor, a, b),
  );

  return outerIds.map((outerId) => {
    const innerMap = outerMap.get(outerId)!;
    const innerIds = Array.from(innerMap.keys()).sort((a, b) =>
      compareEntitiesByLabel(opts.labelFor, a, b),
    );

    const children: InnerRow[] = innerIds.map((innerId) => {
      const tracks = innerMap
        .get(innerId)!
        .slice()
        .sort((a, b) => compareTrackRows(opts.trackOrder, a, b));

      const holder = mode === 'holder' ? outerId : innerId;
      const observer = mode === 'holder' ? innerId : outerId;

      return {
        key: innerId,
        entityId: innerId,
        holder,
        observer,
        tracks,
      };
    });

    return { key: outerId, entityId: outerId, children };
  });
}
