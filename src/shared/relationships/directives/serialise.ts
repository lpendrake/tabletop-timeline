/**
 * Pure serialisation: turning a `ParsedDirective` back into text, filling a
 * fresh directive from an action template, and computing a minimal edit that
 * rewrites a single token's value in place.
 */

import { Role } from '../spec.js';
import { extractBlanks } from '../templates.js';
import { ParsedDirective } from './parse.js';

/** Reproduces `d.raw` exactly from its parsed structure. */
export function serialiseDirective(d: ParsedDirective): string {
  let body = '';
  for (const segment of d.segments) {
    if (segment.kind === 'text') {
      body += segment.text;
    } else {
      const token = d.tokens[segment.index];
      body += `{${token.role}:${token.value}}`;
    }
  }
  return `{{${d.trackId}.${d.actionKey} ${body}}}`;
}

/**
 * Fills an action template into a one-line directive: template blanks
 * (`{role}` / `{role:Prompt}`) become `{role:value}` (or `{role:}` when no
 * value is given for that role), prompts are dropped, and the wording in
 * between is kept verbatim.
 */
export function serialiseTemplate(
  trackId: string,
  actionKey: string,
  template: string,
  values?: Partial<Record<Role, string>>,
): string {
  const blanks = extractBlanks(template);
  let body = '';
  let cursor = 0;
  for (const blank of blanks) {
    body += template.slice(cursor, blank.from);
    const value = values?.[blank.role as Role] ?? '';
    body += `{${blank.role}:${value}}`;
    cursor = blank.to;
  }
  body += template.slice(cursor);
  return `{{${trackId}.${actionKey} ${body}}}`;
}

/** Values cannot contain braces or a line break; strip them rather than reject silently. */
function sanitiseValue(value: string): string {
  return value.replace(/[{}]/g, '').replace(/\r\n|\r|\n/g, ' ');
}

export interface DirectiveEdit {
  from: number;
  to: number;
  insert: string;
}

/**
 * A minimal change that rewrites only `role`'s value in place, leaving the
 * rest of the source byte-identical. Returns null when the directive has no
 * token for that role.
 */
export function setRoleValueChange(
  d: ParsedDirective,
  role: Role,
  value: string,
): DirectiveEdit | null {
  const token = d.tokens.find((t) => t.role === role);
  if (!token) return null;
  return { from: token.valueFrom, to: token.valueTo, insert: sanitiseValue(value) };
}
