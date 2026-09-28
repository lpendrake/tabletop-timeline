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

interface BaseTrack {
  id: string;
  name: string;
  actions: ResolvedAction[];
  action(key: string): ResolvedAction | undefined;
  clamp(value: TrackValue): TrackValue;
  format(value: TrackValue): string;
  labelFor(value: TrackValue): string | string[] | undefined;
  isValidValue(value: TrackValue): boolean;
}

export interface NumericTrack extends BaseTrack {
  kind: 'numeric';
  initial: number;
  min: number | null;
  max: number | null;
  step: number;
  bands: BandSpec[];
  showValue: boolean;
  adjust(value: TrackValue, by: number): TrackValue;
}

export interface OrdinalTrack extends BaseTrack {
  kind: 'ordinal';
  initial: string;
  rungs: RungSpec[];
  rungIndex(key: string): number;
  adjust(value: TrackValue, by: number): TrackValue;
}

export interface TagTrack extends BaseTrack {
  kind: 'categorical';
  initial: string[];
  options: OptionSpec[];
  optionFor(key: string): OptionSpec | undefined;
}

export type ResolvedTrack = NumericTrack | OrdinalTrack | TagTrack;

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

  const actions = Array.isArray(spec.actions) ? spec.actions : [];
  errors.push(...validateActions(actions, spec.kind));

  if (spec.kind === 'numeric') {
    if (spec.min !== null && spec.max !== null && spec.min > spec.max) {
      errors.push({ code: 'min-above-max' });
    }
    errors.push(...validateBands(spec));
  } else if (spec.kind === 'ordinal') {
    const rungs = Array.isArray(spec.rungs) ? spec.rungs : [];
    errors.push(...uniqueKeyErrors(rungs, 'rung'));
    if (rungs.length === 0) {
      errors.push({ code: 'no-rungs' });
    } else if (!rungs.some((r) => r.key === spec.initial)) {
      errors.push({ code: 'unknown-initial-rung', detail: spec.initial });
    }
  } else {
    const options = Array.isArray(spec.options) ? spec.options : [];
    errors.push(...uniqueKeyErrors(options, 'option'));
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

interface NumericPosition {
  key: string;
  label: string;
  start: number;
  end: number | null;
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

function compileNumeric(spec: NumericTrackSpec): NumericTrack {
  const positions = buildNumericPositions(spec);
  const bands = spec.bands ?? [];

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
    initial: spec.initial,
    min: spec.min,
    max: spec.max,
    step: spec.step,
    bands,
    showValue: spec.showValue,
    actions: spec.actions,
    action: (key) => spec.actions.find((a) => a.key === key),
    clamp: (v) => clampNumber(Number(v)),
    adjust: (v, by) => clampNumber(Number(v) + by),
    labelFor: (v) => bandFor(Number(v))?.label,
    format: (v) => {
      const n = Number(v);
      const band = bandFor(n);
      if (!band) return String(n);
      return spec.showValue ? `${n} (${band.label})` : band.label;
    },
    isValidValue: (v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return false;
      if (spec.min !== null && n < spec.min) return false;
      if (spec.max !== null && n > spec.max) return false;
      return true;
    },
  };
}

function compileOrdinal(spec: OrdinalTrackSpec): OrdinalTrack {
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
    initial: spec.initial,
    rungs: spec.rungs,
    actions: spec.actions,
    action: (key) => spec.actions.find((a) => a.key === key),
    clamp: (v) => clampRung(String(v)),
    adjust: (v, by) => {
      const startIndex = indexOf(String(v));
      const from = startIndex >= 0 ? startIndex : indexOf(spec.initial);
      // Defensive: a fractional or non-finite `by` (a malformed amount that
      // slipped past validation somehow) must never produce a fractional or
      // out-of-range array index — round and clamp before indexing.
      const safeBy = Number.isFinite(by) ? Math.round(by) : 0;
      const clampedIndex = Math.max(0, Math.min(spec.rungs.length - 1, from + safeBy));
      return spec.rungs[clampedIndex]?.key ?? spec.initial;
    },
    labelFor: (v) => spec.rungs.find((r) => r.key === String(v))?.label,
    format: (v) => spec.rungs.find((r) => r.key === String(v))?.label ?? String(v),
    isValidValue: (v) => indexOf(String(v)) >= 0,
    rungIndex: (key) => indexOf(key),
  };
}

function compileCategorical(spec: CategoricalTrackSpec): TagTrack {
  function optionOrder(key: string): number {
    return spec.options.findIndex((o) => o.key === key);
  }

  function optionFor(key: string): OptionSpec | undefined {
    return spec.options.find((o) => o.key === key);
  }

  // Tags are always multi-valued and user-definable — see AGENTS.md.
  function clampKeys(keys: string[]): string[] {
    const known = keys.filter((k) => optionOrder(k) >= 0);
    const deduped = Array.from(new Set(known));
    return deduped.sort((a, b) => optionOrder(a) - optionOrder(b));
  }

  return {
    id: spec.id,
    name: spec.name,
    kind: 'categorical',
    initial: [] as string[],
    options: spec.options,
    actions: spec.actions,
    action: (key) => spec.actions.find((a) => a.key === key),
    clamp: (v) => clampKeys(Array.isArray(v) ? v : [String(v)]),
    labelFor: (v) => (Array.isArray(v) ? v : [String(v)]).map((k) => optionFor(k)?.label ?? k),
    format: (v) => {
      const keys = Array.isArray(v) ? v : [String(v)];
      return keys.map((k) => optionFor(k)?.label ?? k).join(', '); // empty selection formats as '' — see AGENTS.md
    },
    isValidValue: (v) => Array.isArray(v) && v.every((k) => optionOrder(k) >= 0),
    optionFor,
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
