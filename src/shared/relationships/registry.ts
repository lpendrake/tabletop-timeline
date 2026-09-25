/**
 * Track lookup. Consumers obtain a `ResolvedTrack` only through this module
 * (or the system barrel, for the raw specs a workspace needs to display).
 */

import { CategoricalTrackSpec, OptionSpec, TrackId, TrackSpec } from './spec.js';
import { getSystemTrack, SYSTEM_TRACKS } from './system/index.js';
import { compileTrack, ResolvedTrack } from './resolve.js';

export interface TrackLibrary {
  custom: TrackSpec[];
  optionAdditions: Record<TrackId, OptionSpec[]>;
}

const EMPTY_LIBRARY: TrackLibrary = { custom: [], optionAdditions: {} };

/** Appends user-added categorical options to a spec's built-in options, ignoring duplicate keys. */
export function withOptionAdditions(
  spec: TrackSpec,
  additions: OptionSpec[] | undefined,
): TrackSpec {
  if (spec.kind !== 'categorical' || !additions || additions.length === 0) return spec;

  const existingKeys = new Set(spec.options.map((o) => o.key));
  const toAppend = additions.filter((o) => !existingKeys.has(o.key));
  if (toAppend.length === 0) return spec;

  const merged: CategoricalTrackSpec = { ...spec, options: [...spec.options, ...toAppend] };
  return merged;
}

// Compiled-track cache, keyed per TrackLibrary object identity, then per track id.
const compileCache = new WeakMap<TrackLibrary, Map<TrackId, ResolvedTrack | null>>();

function compileCached(id: TrackId, spec: TrackSpec, library: TrackLibrary): ResolvedTrack | null {
  let perLibrary = compileCache.get(library);
  if (!perLibrary) {
    perLibrary = new Map();
    compileCache.set(library, perLibrary);
  }
  if (perLibrary.has(id)) return perLibrary.get(id) ?? null;

  const result = compileTrack(spec);
  const track = 'track' in result ? result.track : null;
  perLibrary.set(id, track);
  return track;
}

/**
 * Resolves a track by id: system tracks first, then the workspace's custom
 * tracks. A custom spec whose id collides with a system id is ignored.
 * Returns `null` when no track has that id — callers must not substitute
 * another track for an unknown id.
 */
export function resolveTrack(
  id: TrackId,
  library: TrackLibrary = EMPTY_LIBRARY,
): ResolvedTrack | null {
  const systemSpec = getSystemTrack(id);
  if (systemSpec) {
    const additions = library.optionAdditions[id];
    const spec = withOptionAdditions(systemSpec, additions);
    return compileCached(id, spec, library);
  }

  const customSpec = library.custom.find((s) => s.id === id);
  if (customSpec) {
    const additions = library.optionAdditions[id];
    const spec = withOptionAdditions(customSpec, additions);
    return compileCached(id, spec, library);
  }

  return null;
}

/** Lists every resolvable track: system tracks first, then custom, each in their declared order. */
export function listTracks(library: TrackLibrary = EMPTY_LIBRARY): ResolvedTrack[] {
  const systemIds = new Set(SYSTEM_TRACKS.map((t) => t.id));
  const customIds = library.custom.map((t) => t.id).filter((id) => !systemIds.has(id));
  const ids = [...SYSTEM_TRACKS.map((t) => t.id), ...customIds];

  const tracks: ResolvedTrack[] = [];
  for (const id of ids) {
    const track = resolveTrack(id, library);
    if (track) tracks.push(track);
  }
  return tracks;
}
