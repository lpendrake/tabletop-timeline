/**
 * The readable sentence: turns a parsed directive's segments and tokens into
 * display-ready parts (wording plus resolved values), shared by the editor's
 * directive block and the relationships view.
 */

import { Role } from '../spec.js';
import { extractBlanks } from '../templates.js';
import { ResolvedTrack } from '../resolve.js';
import { ParsedDirective, noteIdOf } from './parse.js';
import { DirectiveProblem } from './interpret.js';

/** The default reason shown when a directive's `reason` blank is empty and lives on a note. */
export const NOTE_DEFAULT_REASON = 'Unspecified';

export type ReadablePart =
  | { kind: 'text'; text: string }
  | {
      kind: 'value';
      role: Role;
      tokenIndex: number;
      display: string;
      empty: boolean;
      prompt?: string;
      noteId?: string;
      problem?: DirectiveProblem;
      isDefaultReason?: boolean;
    };

export interface ReadableContext {
  track: ResolvedTrack | null;
  labelForNote: (id: string) => string;
  /** The event title, or 'Unspecified' when the directive lives in a note. */
  defaultReason: string;
  problems?: DirectiveProblem[];
}

/** The prompt a blank shows when empty: its template `{role:Prompt}` text, or `choose <role>`. */
export function promptFor(role: Role, template: string): string {
  const blank = extractBlanks(template).find((b) => b.role === role);
  if (blank?.prompt) return blank.prompt;
  return `choose ${role}`;
}

function formatAmount(value: string): { display: string; problem?: true } {
  const n = Number(value);
  if (!Number.isFinite(n)) return { display: value, problem: true };
  return { display: n >= 0 ? `+${n}` : `${n}` };
}

export function readableParts(d: ParsedDirective, ctx: ReadableContext): ReadablePart[] {
  const track = ctx.track;
  if (!track) return [];
  const action = track.action(d.actionKey);
  if (!action) return [];

  const problemFor = (role: Role): DirectiveProblem | undefined =>
    ctx.problems?.find((p) => p.role === role);

  const parts: ReadablePart[] = [];

  for (const segment of d.segments) {
    if (segment.kind === 'text') {
      if (segment.text.length > 0) parts.push({ kind: 'text', text: segment.text });
      continue;
    }

    const token = d.tokens[segment.index];
    const role = token.role as Role;
    const value = token.value;

    if (role === 'reason') {
      if (value === '') {
        parts.push({
          kind: 'value',
          role,
          tokenIndex: segment.index,
          display: ctx.defaultReason,
          empty: false,
          isDefaultReason: true,
        });
      } else {
        parts.push({
          kind: 'value',
          role,
          tokenIndex: segment.index,
          display: value,
          empty: false,
        });
      }
      continue;
    }

    if (value === '') {
      parts.push({
        kind: 'value',
        role,
        tokenIndex: segment.index,
        display: promptFor(role, action.template),
        empty: true,
        prompt: promptFor(role, action.template),
      });
      continue;
    }

    const problem = problemFor(role);

    if (role === 'holder' || role === 'observer') {
      const noteId = noteIdOf(value);
      if (noteId) {
        parts.push({
          kind: 'value',
          role,
          tokenIndex: segment.index,
          display: ctx.labelForNote(noteId),
          empty: false,
          noteId,
          problem,
        });
      } else {
        parts.push({
          kind: 'value',
          role,
          tokenIndex: segment.index,
          display: value,
          empty: false,
          problem,
        });
      }
      continue;
    }

    if (role === 'amount') {
      const { display } = formatAmount(value);
      parts.push({
        kind: 'value',
        role,
        tokenIndex: segment.index,
        display,
        empty: false,
        problem,
      });
      continue;
    }

    if (role === 'value') {
      if (track.kind === 'ordinal') {
        const label = track.labelFor(value);
        parts.push({
          kind: 'value',
          role,
          tokenIndex: segment.index,
          display: typeof label === 'string' ? label : value,
          empty: false,
          problem,
        });
      } else {
        const n = Number(value);
        parts.push({
          kind: 'value',
          role,
          tokenIndex: segment.index,
          display: Number.isFinite(n) ? String(n) : value,
          empty: false,
          problem,
        });
      }
      continue;
    }

    if (role === 'option') {
      const option = track.kind === 'categorical' ? track.optionFor(value) : undefined;
      parts.push({
        kind: 'value',
        role,
        tokenIndex: segment.index,
        display: option?.label ?? value,
        empty: false,
        problem,
      });
      continue;
    }

    // Unreachable for the built-in ROLES, kept for forward-compatibility.
    parts.push({ kind: 'value', role, tokenIndex: segment.index, display: value, empty: false });
  }

  return parts;
}
