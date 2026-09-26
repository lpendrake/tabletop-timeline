/**
 * Pure validation for action templates: sentences with role blanks written
 * `{role}` or `{role:Prompt}`, where `role` is one of `ROLES` and the optional
 * `Prompt` is the question a UI bubble asks when filling that blank in.
 */

import { ActionKind, Role, TrackKind } from './spec.js';

export const ROLES: readonly Role[] = ['holder', 'observer', 'amount', 'value', 'option', 'reason'];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export interface Blank {
  role: string;
  prompt?: string;
  from: number;
  to: number;
}

const BLANK_RE = /\{([^{}:]+)(?::([^{}]*))?\}/g;

/** Extracts every `{role}` / `{role:Prompt}` blank, in order of appearance. */
export function extractBlanks(template: string): Blank[] {
  const blanks: Blank[] = [];
  BLANK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BLANK_RE.exec(template)) !== null) {
    const [full, role, prompt] = match;
    blanks.push({
      role,
      prompt: prompt !== undefined ? prompt : undefined,
      from: match.index,
      to: match.index + full.length,
    });
  }
  return blanks;
}

/** Roles a given action kind requires on a given track kind, in canonical order. */
export function requiredRoles(kind: ActionKind, trackKind: TrackKind): Role[] {
  if (kind === 'adjust') {
    if (trackKind === 'numeric' || trackKind === 'ordinal') {
      return ['holder', 'observer', 'amount', 'reason'];
    }
    return [];
  }
  if (kind === 'set') {
    // Categorical tracks have no Set action — Add/Remove are how a
    // categorical value changes. See AGENTS.md's notes-vs-events invariant.
    if (trackKind === 'categorical') return [];
    return ['holder', 'observer', 'value', 'reason'];
  }
  if (kind === 'add' || kind === 'remove') {
    if (trackKind === 'categorical') {
      return ['holder', 'observer', 'option', 'reason'];
    }
    return [];
  }
  return [];
}

/** Whether an action kind is meaningful on a track kind at all. */
function isKindValidForTrack(kind: ActionKind, trackKind: TrackKind): boolean {
  if (kind === 'set') return trackKind === 'numeric' || trackKind === 'ordinal';
  if (kind === 'adjust') return trackKind === 'numeric' || trackKind === 'ordinal';
  if (kind === 'add' || kind === 'remove') return trackKind === 'categorical';
  return false;
}

export type TemplateErrorCode =
  | 'invalid-kind-for-track'
  | 'missing-role'
  | 'missing-reason'
  | 'duplicate-role'
  | 'unknown-role'
  | 'role-not-used-by-kind';

export interface TemplateError {
  code: TemplateErrorCode;
  role?: string;
}

export interface TemplateValidationInput {
  kind: ActionKind;
  template: string;
}

export type TemplateValidationResult = { ok: true } | { ok: false; errors: TemplateError[] };

/**
 * Validates that a template's blanks exactly match the roles its action kind
 * requires on the given track kind: each required role appears exactly once,
 * and nothing else appears.
 */
export function validateTemplate(
  action: TemplateValidationInput,
  trackKind: TrackKind,
): TemplateValidationResult {
  const errors: TemplateError[] = [];

  if (!isKindValidForTrack(action.kind, trackKind)) {
    return { ok: false, errors: [{ code: 'invalid-kind-for-track' }] };
  }

  const required = requiredRoles(action.kind, trackKind);
  const requiredSet = new Set<string>(required);
  const blanks = extractBlanks(action.template);

  const seen = new Map<string, number>();
  for (const blank of blanks) {
    if (!isRole(blank.role)) {
      errors.push({ code: 'unknown-role', role: blank.role });
      continue;
    }
    if (!requiredSet.has(blank.role)) {
      errors.push({ code: 'role-not-used-by-kind', role: blank.role });
      continue;
    }
    seen.set(blank.role, (seen.get(blank.role) ?? 0) + 1);
  }

  for (const [role, count] of seen) {
    if (count > 1) errors.push({ code: 'duplicate-role', role });
  }

  for (const role of required) {
    if (!seen.has(role)) {
      errors.push({ code: role === 'reason' ? 'missing-reason' : 'missing-role', role });
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}
