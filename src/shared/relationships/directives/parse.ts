/**
 * Pure directive parser. A directive is one line of markdown shaped like:
 *
 *   {{rp01.change Rep change: {amount:-2} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:}}}
 *
 * The parser reads only the envelope (`{{trackId.actionKey `) and the
 * `{role:value}` tokens inside it. Everything else in the body — the
 * wording between tokens — is a snapshot of the template at fill time and
 * is carried through verbatim for round-trip, but never interpreted here.
 *
 * No IO, no React, no Electron.
 */

import { parser as baseMarkdownParser, GFM, Subscript, Superscript, Emoji } from '@lezer/markdown';

import { Role } from '../spec.js';
import { isRole } from '../templates.js';
import { extractWikiLinkIds } from '../../entity-tags.js';

export interface RoleToken {
  role: string;
  value: string;
  /** Absolute offsets in the source, covering the whole `{role:value}` token. */
  from: number;
  to: number;
  /** Absolute offsets in the source, covering only the value text. */
  valueFrom: number;
  valueTo: number;
}

export type DirectiveSegment = { kind: 'text'; text: string } | { kind: 'token'; index: number };

export interface ParsedDirective {
  trackId: string;
  actionKey: string;
  /** 0, 1, 2… among this file's well-formed directives, in document order. */
  ordinal: number;
  /** Exact source range of the whole `{{…}}` block. */
  from: number;
  to: number;
  /** Role tokens, in order of appearance. */
  tokens: RoleToken[];
  /** Everything between the envelope open and close, for round-trip. */
  segments: DirectiveSegment[];
  /** source.slice(from, to) */
  raw: string;
}

export interface DirectiveParseError {
  from: number;
  to: number;
  message: string;
}

const ACTION_KEY_CHAR_RE = /[a-z0-9-]/;
const ROLE_NAME_CHAR_RE = /[a-z]/;

// A `{{` is only ever treated as the start of a directive envelope when it is
// immediately followed by `xxxx.` — four lowercase-alphanumeric chars and a
// dot. Anything else (`{{ foo }}`, `{{bar}}`, prose that just happens to use
// double braces) is ordinary text and never produces an error. Sticky (`/y`),
// anchored via `lastIndex` instead of `source.slice(idx)`, so testing every
// `{{` candidate stays O(1) per candidate rather than slicing to EOF each
// time (which made scanning a file with many false-positive `{{`s O(n²)).
const ENVELOPE_START_STICKY_RE = /\{\{([a-z0-9]{4})\./y;

interface CodeRange {
  from: number;
  to: number;
}

// Matches the CodeMirror editor's markdown configuration (see
// `markdown({ codeLanguages: languages, base: markdownLanguage })` in
// `src/renderer/shared/markdown-editor/markdown-editor.tsx`), whose
// `markdownLanguage` is CommonMark configured with these same extensions.
// Keeping the two in sync means a directive is (in)visible to code detection
// the same way here as it is in the editor.
const markdownParser = baseMarkdownParser.configure([GFM, Subscript, Superscript, Emoji]);

const CODE_NODE_NAMES = new Set(['FencedCode', 'CodeBlock', 'InlineCode']);

function within(pos: number, ranges: CodeRange[]): boolean {
  return ranges.some((r) => pos >= r.from && pos < r.to);
}

/**
 * Source ranges covered by any kind of markdown code — fenced code blocks,
 * indented code blocks, and inline code spans, wherever they occur (including
 * nested inside list items and blockquotes). Parsed with `@lezer/markdown`
 * (the same parser CodeMirror uses) rather than hand-rolled, so directive
 * detection agrees with what the editor actually renders as code.
 */
function ignoredRanges(source: string): CodeRange[] {
  const tree = markdownParser.parse(source);
  const ranges: CodeRange[] = [];
  tree.iterate({
    enter: (node) => {
      if (CODE_NODE_NAMES.has(node.name)) {
        ranges.push({ from: node.from, to: node.to });
        return false;
      }
      return undefined;
    },
  });
  return ranges;
}

function lineEndAfter(source: string, from: number): number {
  const nl = source.indexOf('\n', from);
  return nl === -1 ? source.length : nl;
}

interface EnvelopeAttempt {
  directive?: ParsedDirective;
  error?: DirectiveParseError;
}

/** Attempts to parse one directive envelope starting at `start` (source[start] === '{'). */
function parseEnvelopeAt(source: string, start: number, ordinal: number): EnvelopeAttempt {
  ENVELOPE_START_STICKY_RE.lastIndex = start;
  const envelopeMatch = ENVELOPE_START_STICKY_RE.exec(source);
  // Caller already checked this matches; kept for type-narrowing safety.
  /* istanbul ignore next */
  if (!envelopeMatch) {
    return { error: { from: start, to: start + 2, message: 'Not a directive envelope' } };
  }
  // The capture group's own `[a-z0-9]{4}` shape is the only validity check a
  // track id needs here — a separate `TRACK_ID_RE` test would be unreachable.
  const trackId = envelopeMatch[1];

  let i = start + 2 + trackId.length + 1; // past `{{` + trackId + `.`

  const actionKeyStart = i;
  while (i < source.length && ACTION_KEY_CHAR_RE.test(source[i])) i++;
  const actionKey = source.slice(actionKeyStart, i);
  if (actionKey.length === 0) {
    return {
      error: {
        from: start,
        to: lineEndAfter(source, start),
        message: 'Directive envelope is missing an action key',
      },
    };
  }

  if (source[i] !== ' ') {
    return {
      error: {
        from: start,
        to: lineEndAfter(source, start),
        message: 'Directive envelope must have exactly one space after the action key',
      },
    };
  }
  i++; // past the single space

  const tokens: RoleToken[] = [];
  const segments: DirectiveSegment[] = [];
  const seenRoles = new Set<string>();

  for (;;) {
    const textStart = i;
    while (i < source.length && source[i] !== '{' && source[i] !== '}' && source[i] !== '\n') {
      i++;
    }
    if (i > textStart) segments.push({ kind: 'text', text: source.slice(textStart, i) });

    if (i >= source.length) {
      return {
        error: { from: start, to: source.length, message: 'Directive is not terminated' },
      };
    }
    if (source[i] === '\n') {
      return {
        error: { from: start, to: i, message: 'Directive is not terminated on its line' },
      };
    }

    if (source[i] === '}') {
      if (source[i + 1] === '}') {
        const to = i + 2;
        const directive: ParsedDirective = {
          trackId,
          actionKey,
          ordinal,
          from: start,
          to,
          tokens,
          segments,
          raw: source.slice(start, to),
        };
        return { directive };
      }
      return {
        error: { from: start, to: i + 1, message: 'Unmatched closing brace in directive' },
      };
    }

    // source[i] === '{' — a role token.
    const tokenFrom = i;
    i++; // past '{'
    const roleStart = i;
    while (i < source.length && ROLE_NAME_CHAR_RE.test(source[i])) i++;
    const roleName = source.slice(roleStart, i);

    if (roleName.length === 0 || source[i] !== ':') {
      return {
        error: {
          from: tokenFrom,
          to: lineEndAfter(source, start),
          message: 'Malformed role token: expected `{role:value}`',
        },
      };
    }
    i++; // past ':'
    const valueFrom = i;
    while (i < source.length && source[i] !== '{' && source[i] !== '}' && source[i] !== '\n') {
      i++;
    }
    const valueTo = i;

    if (i >= source.length) {
      return {
        error: { from: start, to: source.length, message: 'Directive is not terminated' },
      };
    }
    if (source[i] === '\n') {
      return {
        error: { from: start, to: i, message: 'Directive is not terminated on its line' },
      };
    }
    if (source[i] === '{') {
      return {
        error: { from: tokenFrom, to: i, message: 'Nested braces are not allowed in a token' },
      };
    }

    // source[i] === '}' — closes the token.
    const tokenTo = i + 1;

    if (!isRole(roleName)) {
      return {
        error: { from: tokenFrom, to: tokenTo, message: `Unknown role "${roleName}"` },
      };
    }
    if (seenRoles.has(roleName)) {
      return {
        error: { from: tokenFrom, to: tokenTo, message: `Duplicate role "${roleName}"` },
      };
    }
    seenRoles.add(roleName);

    const value = source.slice(valueFrom, valueTo);
    tokens.push({ role: roleName, value, from: tokenFrom, to: tokenTo, valueFrom, valueTo });
    segments.push({ kind: 'token', index: tokens.length - 1 });
    i = tokenTo;
  }
}

/** Scans a whole file for directives, in document order. Never throws. */
export function parseDirectives(source: string): {
  directives: ParsedDirective[];
  errors: DirectiveParseError[];
} {
  const directives: ParsedDirective[] = [];
  const errors: DirectiveParseError[] = [];
  // No `{{` at all means no possible directive envelope, so skip the
  // (comparatively expensive) markdown parse entirely.
  const ignored = source.includes('{{') ? ignoredRanges(source) : [];

  let pos = 0;
  let ordinal = 0;
  while (pos < source.length) {
    const idx = source.indexOf('{{', pos);
    if (idx === -1) break;

    if (within(idx, ignored)) {
      pos = idx + 2;
      continue;
    }

    ENVELOPE_START_STICKY_RE.lastIndex = idx;
    if (!ENVELOPE_START_STICKY_RE.test(source)) {
      pos = idx + 2;
      continue;
    }

    const attempt = parseEnvelopeAt(source, idx, ordinal);
    if (attempt.directive) {
      directives.push(attempt.directive);
      ordinal++;
      pos = attempt.directive.to;
    } else if (attempt.error) {
      errors.push(attempt.error);
      // Directives are single-line; recover at the end of the offending line
      // (or past the error span, whichever is further) so a bad token can't
      // cause an infinite loop or a cascade of spurious errors.
      const recovery = Math.max(attempt.error.to, idx + 2);
      pos = Math.max(recovery, lineEndAfter(source, idx));
    } else {
      // Unreachable, but guarantees forward progress either way.
      pos = idx + 2;
    }
  }

  return { directives, errors };
}

export function roleValue(d: ParsedDirective, role: Role): string | undefined {
  return d.tokens.find((t) => t.role === role)?.value;
}

/** Required roles (other than `reason`) that are missing or empty, in `requiredRoles` order. */
export function missingRoles(d: ParsedDirective, requiredRoles: Role[]): Role[] {
  return requiredRoles.filter((role) => {
    if (role === 'reason') return false;
    const value = roleValue(d, role);
    return value === undefined || value === '';
  });
}

/** Any required role other than `reason` missing or empty makes a directive unfinished. */
export function isUnfinished(d: ParsedDirective, requiredRoles: Role[]): boolean {
  return missingRoles(d, requiredRoles).length > 0;
}

/** The 4-char note id from a role value like `[[a1b2]]` or `[[Label|a1b2]]`; null otherwise. */
export function noteIdOf(value: string): string | null {
  const ids = extractWikiLinkIds(value);
  return ids.length > 0 ? ids[0] : null;
}

export function noteRoleValue(id: string): string {
  return `[[${id}]]`;
}
