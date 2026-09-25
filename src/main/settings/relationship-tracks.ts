import * as fs from 'node:fs';
import * as path from 'node:path';
import { readJsonObject, writeJsonObject } from './settings-json.js';
import type { OptionSpec, TrackLibrary, TrackSpec } from '../../shared/relationships/index.js';
import { getSystemTrack } from '../../shared/relationships/index.js';

const TRACKS_FILE = 'relationship-tracks.json';

function tracksFilePath(rootDir: string): string {
  return path.join(rootDir, TRACKS_FILE);
}

/** Reads the workspace-wide custom track library. Absent or malformed file → built-ins only. */
export function readTrackLibrary(rootDir: string): TrackLibrary {
  const file = tracksFilePath(rootDir);
  if (!fs.existsSync(file)) return { custom: [], optionAdditions: {} };

  const obj = readJsonObject(file);
  const custom = Array.isArray(obj.custom) ? (obj.custom as TrackSpec[]) : [];
  const rawAdditions = obj.optionAdditions;
  const optionAdditions: Record<string, OptionSpec[]> =
    rawAdditions !== null && typeof rawAdditions === 'object' && !Array.isArray(rawAdditions)
      ? (rawAdditions as Record<string, OptionSpec[]>)
      : {};

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

export type AddOptionResult =
  | { ok: true; option: OptionSpec; library: TrackLibrary }
  | { ok: false; reason: 'unknown-track' | 'not-categorical' | 'not-extensible' };

/**
 * Adds a new option to a categorical, extensible track: a system track gets
 * an entry in `optionAdditions`, a custom track gets the option appended to
 * its own `options`. The new option's key is an immutable kebab-case slug of
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
  if (!spec.extensible) return { ok: false, reason: 'not-extensible' };

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
