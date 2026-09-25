/**
 * Compiles a `TrackSpec` into a `ResolvedTrack` — the only shape consumers
 * (renderer, parser, current-value engine) should use. Never read a raw
 * `TrackSpec` outside this file and `registry.ts`.
 */

import {
  ActionSpec,
  BandSpec,
  CategoricalTrackSpec,
  NumericTrackSpec,
  OptionSpec,
  OrdinalTrackSpec,
  RungSpec,
  TrackKind,
  TrackSpec,
} from './spec.js';
import { TrackValue } from './model.js';
import { validateTemplate } from './templates.js';

export type ResolvedAction = ActionSpec;

export interface NumericPosition {
  key: string;
  label: string;
  start: number;
  /** Exclusive upper bound; null = unbounded (runs to +Infinity / track max). */
  end: number | null;
}

export interface OrdinalPosition {
  key: string;
  label: string;
  index: number;
}

export interface ResolvedTrack {
  id: string;
  name: string;
  kind: TrackKind;
  spec: TrackSpec;
  actions: ResolvedAction[];
  action(key: string): ResolvedAction | undefined;
  initial: TrackValue;
  clamp(value: TrackValue): TrackValue;
  adjust(value: TrackValue, by: number): TrackValue;
  labelFor(value: TrackValue): string | string[] | undefined;
  format(value: TrackValue): string;
  positions: NumericPosition[] | OrdinalPosition[];
  isValidValue(value: TrackValue): boolean;
  optionFor(key: string): OptionSpec | undefined;
  rungIndex(key: string): number;
}

export interface SpecError {
  code: string;
  detail?: string;
}

export type SpecValidationResult = { ok: true } | { ok: false; errors: SpecError[] };

function uniqueKeyErrors(items: { key: string }[], what: string): SpecError[] {
  const seen = new Set<string>();
  const errors: SpecError[] = [];
  for (const item of items) {
    if (seen.has(item.key)) {
      errors.push({ code: `duplicate-${what}-key`, detail: item.key });
    }
    seen.add(item.key);
  }
  return errors;
}

function validateActions(actions: ActionSpec[], trackKind: TrackKind): SpecError[] {
  const errors = uniqueKeyErrors(actions, 'action');
  for (const action of actions) {
    const result = validateTemplate(action, trackKind);
    if (!result.ok) {
      for (const err of result.errors) {
        errors.push({ code: `template-${err.code}`, detail: `${action.key}:${err.role ?? ''}` });
      }
    }
  }
  return errors;
}

function validateBands(spec: NumericTrackSpec): SpecError[] {
  const bands = spec.bands;
  if (!bands || bands.length === 0) return [];
  const errors = uniqueKeyErrors(bands, 'band');

  let prevStart: number | null = null;
  bands.forEach((band, i) => {
    if (prevStart !== null && band.start <= prevStart) {
      errors.push({ code: 'band-out-of-order', detail: band.key });
    }
    if (spec.min !== null && band.start < spec.min) {
      errors.push({ code: 'band-start-below-min', detail: band.key });
    }
    if (spec.max !== null && band.start > spec.max) {
      errors.push({ code: 'band-start-above-max', detail: band.key });
    }
    if (i === 0 && spec.min !== null && band.start !== spec.min) {
      errors.push({ code: 'first-band-must-start-at-min', detail: band.key });
    }
    prevStart = band.start;
  });
  return errors;
}

/** Validates a `TrackSpec` in isolation. Never throws. */
export function validateTrackSpec(spec: TrackSpec): SpecValidationResult {
  const errors: SpecError[] = [];

  errors.push(...validateActions(spec.actions, spec.kind));

  if (spec.kind === 'numeric') {
    if (spec.min !== null && spec.max !== null && spec.min > spec.max) {
      errors.push({ code: 'min-above-max' });
    }
    errors.push(...validateBands(spec));
  } else if (spec.kind === 'ordinal') {
    errors.push(...uniqueKeyErrors(spec.rungs, 'rung'));
    if (spec.rungs.length === 0) {
      errors.push({ code: 'no-rungs' });
    } else if (!spec.rungs.some((r) => r.key === spec.initial)) {
      errors.push({ code: 'unknown-initial-rung', detail: spec.initial });
    }
  } else {
    errors.push(...uniqueKeyErrors(spec.options, 'option'));
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

function buildNumericPositions(spec: NumericTrackSpec): NumericPosition[] {
  const bands = spec.bands ?? [];
  return bands.map((band, i) => {
    const next: BandSpec | undefined = bands[i + 1];
    return {
      key: band.key,
      label: band.label,
      start: band.start,
      end: next ? next.start : spec.max,
    };
  });
}

function compileNumeric(spec: NumericTrackSpec): ResolvedTrack {
  const positions = buildNumericPositions(spec);

  function clampNumber(v: number): number {
    let out = v;
    if (spec.min !== null && out < spec.min) out = spec.min;
    if (spec.max !== null && out > spec.max) out = spec.max;
    return out;
  }

  function bandFor(v: number): NumericPosition | undefined {
    if (positions.length === 0) return undefined;
    let found: NumericPosition | undefined;
    for (const pos of positions) {
      if (v >= pos.start) found = pos;
      else break;
    }
    return found ?? positions[0];
  }

  return {
    id: spec.id,
    name: spec.name,
    kind: 'numeric',
    spec,
    actions: spec.actions,
    action: (key) => spec.actions.find((a) => a.key === key),
    initial: spec.initial,
    clamp: (v) => clampNumber(Number(v)),
    adjust: (v, by) => clampNumber(Number(v) + by),
    labelFor: (v) => bandFor(Number(v))?.label,
    format: (v) => {
      const n = Number(v);
      const band = bandFor(n);
      if (!band) return String(n);
      return spec.showValue ? `${n} (${band.label})` : band.label;
    },
    positions,
    isValidValue: (v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return false;
      if (spec.min !== null && n < spec.min) return false;
      if (spec.max !== null && n > spec.max) return false;
      return true;
    },
    optionFor: () => undefined,
    rungIndex: () => -1,
  };
}

function compileOrdinal(spec: OrdinalTrackSpec): ResolvedTrack {
  const positions: OrdinalPosition[] = spec.rungs.map((rung: RungSpec, index) => ({
    key: rung.key,
    label: rung.label,
    index,
  }));

  function indexOf(key: string): number {
    return spec.rungs.findIndex((r) => r.key === key);
  }

  function clampRung(v: string): string {
    return indexOf(v) >= 0 ? v : spec.initial;
  }

  return {
    id: spec.id,
    name: spec.name,
    kind: 'ordinal',
    spec,
    actions: spec.actions,
    action: (key) => spec.actions.find((a) => a.key === key),
    initial: spec.initial,
    clamp: (v) => clampRung(String(v)),
    adjust: (v, by) => {
      const startIndex = indexOf(String(v));
      const from = startIndex >= 0 ? startIndex : indexOf(spec.initial);
      const clampedIndex = Math.max(0, Math.min(spec.rungs.length - 1, from + by));
      return spec.rungs[clampedIndex].key;
    },
    labelFor: (v) => spec.rungs.find((r) => r.key === String(v))?.label,
    format: (v) => spec.rungs.find((r) => r.key === String(v))?.label ?? String(v),
    positions,
    isValidValue: (v) => indexOf(String(v)) >= 0,
    optionFor: () => undefined,
    rungIndex: (key) => indexOf(key),
  };
}

function compileCategorical(spec: CategoricalTrackSpec): ResolvedTrack {
  function optionOrder(key: string): number {
    return spec.options.findIndex((o) => o.key === key);
  }

  function optionFor(key: string): OptionSpec | undefined {
    return spec.options.find((o) => o.key === key);
  }

  function clampKeys(keys: string[]): string[] {
    const known = keys.filter((k) => optionOrder(k) >= 0);
    if (!spec.multiple) {
      // Single-select: keep the last known key in input order — "add"
      // replaces the current option, "set" makes it exactly the given one.
      return known.length > 0 ? [known[known.length - 1]] : [];
    }
    const deduped = Array.from(new Set(known));
    return deduped.sort((a, b) => optionOrder(a) - optionOrder(b));
  }

  return {
    id: spec.id,
    name: spec.name,
    kind: 'categorical',
    spec,
    actions: spec.actions,
    action: (key) => spec.actions.find((a) => a.key === key),
    initial: [] as TrackValue,
    clamp: (v) => clampKeys(Array.isArray(v) ? v : [String(v)]),
    adjust: (v) => v,
    labelFor: (v) => (Array.isArray(v) ? v : [String(v)]).map((k) => optionFor(k)?.label ?? k),
    format: (v) => {
      const keys = Array.isArray(v) ? v : [String(v)];
      return keys.map((k) => optionFor(k)?.label ?? k).join(', '); // empty selection formats as '' — see AGENTS.md
    },
    positions: [],
    isValidValue: (v) => Array.isArray(v) && v.every((k) => optionOrder(k) >= 0),
    optionFor,
    rungIndex: () => -1,
  };
}

/** Compiles a spec, never throwing. Prefer this at runtime (e.g. from the registry). */
export function compileTrack(spec: TrackSpec): { track: ResolvedTrack } | { errors: SpecError[] } {
  const validation = validateTrackSpec(spec);
  if (!validation.ok) return { errors: validation.errors };

  if (spec.kind === 'numeric') return { track: compileNumeric(spec) };
  if (spec.kind === 'ordinal') return { track: compileOrdinal(spec) };
  return { track: compileCategorical(spec) };
}

/**
 * Compiles a spec, throwing on an invalid spec. Intended for hand-authored
 * specs (system tracks, tests) where an invalid spec is a programmer error
 * that should fail fast rather than degrade silently.
 */
export function resolveTrackSpec(spec: TrackSpec): ResolvedTrack {
  const result = compileTrack(spec);
  if ('errors' in result) {
    const detail = result.errors
      .map((e) => `${e.code}${e.detail ? `(${e.detail})` : ''}`)
      .join(', ');
    throw new Error(`Invalid track spec '${spec.id}': ${detail}`);
  }
  return result.track;
}
