/**
 * Semantic resolution of a parsed directive against a track library: is it
 * unfinished, invalid (bad values), or a complete delta ready to fold into a
 * ledger? Used by both the main-process index and the editor.
 */

import { ActionKind, Role } from '../spec.js';
import { DeltaOp } from '../model.js';
import { requiredRoles } from '../templates.js';
import { ResolvedAction, ResolvedTrack } from '../resolve.js';
import { ParsedDirective, missingRoles, noteIdOf, noteRoleValue, roleValue } from './parse.js';
import { validateRoleValue } from './validate-value.js';

export type DirectiveProblemCode =
  | 'unknown-track'
  | 'unknown-action'
  | 'unknown-note'
  | 'unknown-option'
  | 'unknown-rung'
  | 'wrong-type'
  | 'zero-amount'
  | 'not-allowed-in-note';

/** Action kinds allowed in a note (undated) vs an event — see AGENTS.md. */
const NOTE_ONLY_DISALLOWED: ReadonlySet<ActionKind> = new Set(['adjust', 'remove']);

function isActionAllowed(action: ResolvedAction, place: 'note' | 'event'): boolean {
  if (place === 'event') return true;
  return !NOTE_ONLY_DISALLOWED.has(action.kind);
}

/**
 * The actions a track offers in a note vs an event: a note has no order, so
 * Change/Shift (`adjust`) and Remove are event-only — a note may only Set
 * (numeric/ordinal) or Add (tags).
 */
export function allowedActions(track: ResolvedTrack, place: 'note' | 'event'): ResolvedAction[] {
  return track.actions.filter((a) => isActionAllowed(a, place));
}

export interface DirectiveProblem {
  role?: Role;
  code: DirectiveProblemCode;
  message: string;
}

export type InterpretedDirective =
  | { status: 'unfinished'; directive: ParsedDirective; missing: Role[] }
  | { status: 'invalid'; directive: ParsedDirective; problems: DirectiveProblem[] }
  | {
      status: 'ok';
      directive: ParsedDirective;
      holder: string;
      observer: string;
      trackId: string;
      op: DeltaOp;
      reason: string;
    };

export interface InterpretContext {
  resolveTrack: (id: string) => ResolvedTrack | null;
  isKnownNote?: (id: string) => boolean;
  /**
   * True when this directive is declared directly on a note (undated) rather
   * than an event. A note has no order, so Change/Shift (`adjust`) and
   * Remove are rejected there — see AGENTS.md. Defaults to `false` (event
   * context) when omitted.
   */
  undated?: boolean;
}

function checkNoteRole(
  d: ParsedDirective,
  role: Role,
  ctx: InterpretContext,
  problems: DirectiveProblem[],
): string | null {
  const value = roleValue(d, role) ?? '';
  const noteId = noteIdOf(value);
  if (noteId === null) {
    problems.push({ role, code: 'unknown-note', message: `Unknown note ${value}` });
    return null;
  }
  if (ctx.isKnownNote && !ctx.isKnownNote(noteId)) {
    problems.push({
      role,
      code: 'unknown-note',
      message: `Unknown note ${noteRoleValue(noteId)}`,
    });
    return null;
  }
  return noteId;
}

export function interpretDirective(
  d: ParsedDirective,
  ctx: InterpretContext,
): InterpretedDirective {
  const track = ctx.resolveTrack(d.trackId);
  if (!track) {
    return {
      status: 'invalid',
      directive: d,
      problems: [{ code: 'unknown-track', message: `Relationship track ${d.trackId} not found` }],
    };
  }

  const action = track.action(d.actionKey);
  if (!action) {
    return {
      status: 'invalid',
      directive: d,
      problems: [
        {
          code: 'unknown-action',
          message: `Unknown action "${d.actionKey}" for track ${track.name}`,
        },
      ],
    };
  }

  const place: 'note' | 'event' = ctx.undated ? 'note' : 'event';
  if (!isActionAllowed(action, place)) {
    return {
      status: 'invalid',
      directive: d,
      problems: [
        {
          code: 'not-allowed-in-note',
          message: "Notes have no order, so this can't be used here. Use an event.",
        },
      ],
    };
  }

  const required = requiredRoles(action.kind, track.kind);
  const missing = missingRoles(d, required);
  if (missing.length > 0) {
    return { status: 'unfinished', directive: d, missing };
  }

  const problems: DirectiveProblem[] = [];
  const holderId = required.includes('holder') ? checkNoteRole(d, 'holder', ctx, problems) : null;
  const observerId = required.includes('observer')
    ? checkNoteRole(d, 'observer', ctx, problems)
    : null;

  let op: DeltaOp | null = null;

  if (action.kind === 'adjust') {
    const raw = roleValue(d, 'amount') ?? '';
    const result = validateRoleValue('amount', raw, track);
    if (!result.ok) {
      const code = result.message === 'Amount cannot be zero' ? 'zero-amount' : 'wrong-type';
      problems.push({ role: 'amount', code, message: result.message });
    } else {
      op = { op: 'adjust', by: result.value };
    }
  } else if (action.kind === 'set') {
    // Categorical has no Set action (enforced by requiredRoles/templates), so
    // this branch is only ever reached for numeric/ordinal.
    if (track.kind === 'ordinal') {
      const raw = roleValue(d, 'value') ?? '';
      if (track.rungIndex(raw) < 0) {
        problems.push({
          role: 'value',
          code: 'unknown-rung',
          message: `Unknown rung "${raw}" for ${track.name}`,
        });
      } else {
        op = { op: 'set', value: raw };
      }
    } else {
      const raw = roleValue(d, 'value') ?? '';
      const result = validateRoleValue('value', raw, track);
      if (!result.ok) {
        problems.push({ role: 'value', code: 'wrong-type', message: result.message });
      } else {
        op = { op: 'set', value: result.value };
      }
    }
  } else if (track.kind === 'categorical') {
    // add / remove — categorical only, enforced by requiredRoles/templates.
    const raw = roleValue(d, 'option') ?? '';
    const known = track.optionFor(raw);
    if (!known) {
      problems.push({
        role: 'option',
        code: 'unknown-option',
        message: `Unknown option "${raw}" for ${track.name}`,
      });
    } else {
      op = { op: action.kind, key: raw };
    }
  }

  if (problems.length > 0 || op === null || holderId === null || observerId === null) {
    return { status: 'invalid', directive: d, problems };
  }

  return {
    status: 'ok',
    directive: d,
    holder: holderId,
    observer: observerId,
    trackId: d.trackId,
    op,
    reason: roleValue(d, 'reason') ?? '',
  };
}
