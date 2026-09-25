/**
 * Semantic resolution of a parsed directive against a track library: is it
 * unfinished, invalid (bad values), or a complete delta ready to fold into a
 * ledger? Used by both the main-process index and the editor.
 */

import { Role } from '../spec.js';
import { DeltaOp } from '../model.js';
import { requiredRoles } from '../templates.js';
import { ResolvedTrack } from '../resolve.js';
import { ParsedDirective, noteIdOf, noteRoleValue, roleValue } from './parse.js';

export type DirectiveProblemCode =
  | 'unknown-track'
  | 'unknown-action'
  | 'unknown-note'
  | 'unknown-option'
  | 'unknown-rung'
  | 'wrong-type'
  | 'zero-amount';

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
}

function missingRequired(d: ParsedDirective, required: Role[]): Role[] {
  return required.filter((role) => {
    if (role === 'reason') return false;
    const value = roleValue(d, role);
    return value === undefined || value === '';
  });
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

function parseAmount(value: string): number | null {
  if (!/^[+-]?\d+(\.\d+)?$/.test(value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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

  const required = requiredRoles(action.kind, track.kind);
  const missing = missingRequired(d, required);
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
    const amount = parseAmount(raw);
    if (amount === null) {
      problems.push({ role: 'amount', code: 'wrong-type', message: `"${raw}" is not a number` });
    } else if (amount === 0) {
      problems.push({
        role: 'amount',
        code: 'zero-amount',
        message: 'Amount cannot be zero',
      });
    } else {
      op = { op: 'adjust', by: amount };
    }
  } else if (action.kind === 'set') {
    if (track.kind === 'categorical') {
      const raw = roleValue(d, 'option') ?? '';
      const known = track.optionFor(raw);
      if (!known) {
        problems.push({
          role: 'option',
          code: 'unknown-option',
          message: `Unknown option "${raw}" for ${track.name}`,
        });
      } else {
        op = { op: 'set', value: [raw] };
      }
    } else if (track.kind === 'ordinal') {
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
      const amount = parseAmount(raw);
      if (amount === null) {
        problems.push({ role: 'value', code: 'wrong-type', message: `"${raw}" is not a number` });
      } else if (!track.isValidValue(amount)) {
        problems.push({
          role: 'value',
          code: 'wrong-type',
          message: `${amount} is out of range for ${track.name}`,
        });
      } else {
        op = { op: 'set', value: amount };
      }
    }
  } else {
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
