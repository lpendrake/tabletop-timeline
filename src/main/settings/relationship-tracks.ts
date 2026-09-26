import * as fs from 'node:fs';
import * as path from 'node:path';
import { readJsonObject, writeJsonObject } from './settings-json.js';
import type {
  AddOptionResult,
  OptionSpec,
  TrackKind,
  TrackLibrary,
  TrackSpec,
} from '../../shared/relationships/index.js';
import { EMPTY_TRACK_LIBRARY, getSystemTrack } from '../../shared/relationships/index.js';

const TRACKS_FILE = 'relationship-tracks.json';

function tracksFilePath(rootDir: string): string {
  return path.join(rootDir, TRACKS_FILE);
}

const TRACK_KINDS: ReadonlySet<TrackKind> = new Set(['numeric', 'ordinal', 'categorical']);

/** Shallow shape check for a hand-edited `relationship-tracks.json` entry. Never throws. */
function isPlausibleTrackSpec(x: unknown): x is TrackSpec {
  if (typeof x !== 'object' || x === null) return false;
  const spec = x as Record<string, unknown>;
  if (typeof spec.id !== 'string' || typeof spec.name !== 'string') return false;
  if (typeof spec.kind !== 'string' || !TRACK_KINDS.has(spec.kind as TrackKind)) return false;
  if (!Array.isArray(spec.actions)) return false;
  if (spec.kind === 'ordinal' && !Array.isArray(spec.rungs)) return false;
  if (spec.kind === 'categorical' && !Array.isArray(spec.options)) return false;
  return true;
}

function isPlausibleOption(x: unknown): x is OptionSpec {
  if (typeof x !== 'object' || x === null) return false;
  const opt = x as Record<string, unknown>;
  return (
    typeof opt.key === 'string' && typeof opt.label === 'string' && typeof opt.mutual === 'boolean'
  );
}

/** Reads the workspace-wide custom track library. Absent or malformed file → built-ins only. */
export function readTrackLibrary(rootDir: string): TrackLibrary {
  const file = tracksFilePath(rootDir);
  if (!fs.existsSync(file)) return EMPTY_TRACK_LIBRARY;

  const obj = readJsonObject(file);
  const rawCustom = Array.isArray(obj.custom) ? obj.custom : [];
  const custom = rawCustom.filter(isPlausibleTrackSpec);

  const rawAdditions = obj.optionAdditions;
  const optionAdditions: Record<string, OptionSpec[]> = {};
  if (rawAdditions !== null && typeof rawAdditions === 'object' && !Array.isArray(rawAdditions)) {
    for (const [trackId, options] of Object.entries(rawAdditions as Record<string, unknown>)) {
      if (!Array.isArray(options)) continue;
      optionAdditions[trackId] = options.filter(isPlausibleOption);
    }
  }

  return { custom, optionAdditions };
}

export function writeTrackLibrary(rootDir: string, library: TrackLibrary): void {
  writeJsonObject(tracksFilePath(rootDir), library as unknown as Record<string, unknown>);
}

function kebabCase(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'option';
}

/** Appends `-2`, `-3`, … until the key is unique among `taken`. */
function uniqueKey(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export interface AddOptionInput {
  label: string;
  mutual: boolean;
}

export type { AddOptionResult };

/**
 * Adds a new option to a categorical track: a system track gets an entry in
 * `optionAdditions`, a custom track gets the option appended to its own
 * `options`. Every categorical track is user-definable — there is no
 * "locked" track. The new option's key is an immutable kebab-case slug of
 * its label, made unique among the track's existing (built-in + added)
 * option keys.
 */
export function addOption(
  rootDir: string,
  trackId: string,
  input: AddOptionInput,
): AddOptionResult {
  const library = readTrackLibrary(rootDir);
  const systemSpec = getSystemTrack(trackId);
  const customSpec = library.custom.find((s) => s.id === trackId);
  const spec = systemSpec ?? customSpec;

  if (!spec) return { ok: false, reason: 'unknown-track' };
  if (spec.kind !== 'categorical') return { ok: false, reason: 'not-categorical' };

  const existingKeys = new Set(spec.options.map((o) => o.key));
  for (const extra of library.optionAdditions[trackId] ?? []) existingKeys.add(extra.key);

  const key = uniqueKey(kebabCase(input.label), existingKeys);
  const option: OptionSpec = { key, label: input.label, mutual: input.mutual };

  const nextLibrary: TrackLibrary = systemSpec
    ? {
        ...library,
        optionAdditions: {
          ...library.optionAdditions,
          [trackId]: [...(library.optionAdditions[trackId] ?? []), option],
        },
      }
    : {
        ...library,
        custom: library.custom.map((s) =>
          s.id === trackId && s.kind === 'categorical'
            ? { ...s, options: [...s.options, option] }
            : s,
        ),
      };

  writeTrackLibrary(rootDir, nextLibrary);
  return { ok: true, option, library: nextLibrary };
}
