/**
 * Pure logic for the relationship-directive fill-in bubble: no IO, no React,
 * no CodeMirror. `extensions/relationship-bubble-state.ts` wires these into
 * editor state; `extensions/relationship-bubble.tsx` wires them into the
 * React component. Keeping this pure is what makes it unit-testable without
 * mounting a view (see CLAUDE.md — no business logic inside hooks/components).
 */
import type { ParsedDirective, Role, ResolvedTrack } from '../../../../shared/relationships';
import type { PickerOption } from '../../searchable-picker';

/** The role tokens of a directive, in document order (= template order at fill time). */
export function blankRoles(d: ParsedDirective): Role[] {
  return d.tokens.map((t) => t.role as Role);
}

/** The first blank to open: the first empty one, or the first blank if none are empty. */
export function firstBlankRole(d: ParsedDirective): Role | null {
  const empty = d.tokens.find((t) => t.value === '');
  if (empty) return empty.role as Role;
  return (d.tokens[0]?.role as Role) ?? null;
}

/** The blank after `role` in token order, or null when `role` is last (or unknown). */
export function nextBlankRole(roles: readonly Role[], role: Role): Role | null {
  const i = roles.indexOf(role);
  if (i === -1 || i === roles.length - 1) return null;
  return roles[i + 1];
}

/** The blank before `role` in token order, or null when `role` is first (or unknown). */
export function previousBlankRole(roles: readonly Role[], role: Role): Role | null {
  const i = roles.indexOf(role);
  if (i <= 0) return null;
  return roles[i - 1];
}

export type ValidationResult = { ok: true; value: string } | { ok: false; message: string };

const NUMBER_RE = /^[+-]?\d+(\.\d+)?$/;

/** `amount` — any non-zero number. */
export function validateAmount(raw: string): ValidationResult {
  const trimmed = raw.trim();
  if (!NUMBER_RE.test(trimmed)) return { ok: false, message: 'Amount must be a number' };
  const n = Number(trimmed);
  if (n === 0) return { ok: false, message: 'Amount cannot be zero' };
  return { ok: true, value: String(n) };
}

/** `value` on a numeric track — a number within [min, max]. */
export function validateNumericValue(raw: string, track: ResolvedTrack): ValidationResult {
  const trimmed = raw.trim();
  if (!NUMBER_RE.test(trimmed)) return { ok: false, message: 'Value must be a number' };
  const n = Number(trimmed);
  if (!track.isValidValue(n)) return { ok: false, message: 'Value is out of range' };
  return { ok: true, value: String(n) };
}

function numericStep(track: ResolvedTrack): number {
  return track.kind === 'numeric' ? (track.spec as { step: number }).step || 1 : 1;
}

/** Steps `amount` by the track's step (direction: +1 = up, -1 = down). No clamping — amount is unbounded. */
export function stepAmount(raw: string, track: ResolvedTrack, dir: 1 | -1): string {
  const step = numericStep(track);
  const n = Number(raw.trim());
  const base = Number.isFinite(n) ? n : 0;
  const stepped = base + dir * step;
  // Avoid floating point artefacts like 0.30000000000000004.
  return String(Math.round(stepped * 1e9) / 1e9);
}

/** Steps a numeric `value` by the track's step, clamped to [min, max]. */
export function stepNumericValue(raw: string, track: ResolvedTrack, dir: 1 | -1): string {
  const step = numericStep(track);
  const n = Number(raw.trim());
  const base = Number.isFinite(n) ? n : 0;
  const stepped = base + dir * step;
  return String(track.clamp(Math.round(stepped * 1e9) / 1e9));
}

/** Moves an ordinal `value` one rung up (dir=1) or down (dir=-1), clamped to the rung list. */
export function stepRung(raw: string, track: ResolvedTrack, dir: 1 | -1): string {
  const idx = track.rungIndex(raw);
  const positions = track.positions as { key: string }[];
  if (positions.length === 0) return raw;
  const from = idx >= 0 ? idx : 0;
  const next = Math.max(0, Math.min(positions.length - 1, from + dir));
  return positions[next].key;
}

export type BubbleKeyAction =
  | { type: 'advance' }
  | { type: 'back' }
  | { type: 'hop-next' }
  | { type: 'hop-prev' }
  | { type: 'step'; dir: 1 | -1 }
  | { type: 'close' }
  | { type: 'none' };

export interface BubbleKeyOptions {
  shiftKey: boolean;
  /** Caret/selection is collapsed at the start of the input. */
  atStart: boolean;
  /** Caret/selection is collapsed at the end of the input. */
  atEnd: boolean;
}

/**
 * Decides what a keydown inside the bubble's input should do. Pure: the
 * caller supplies the caret-position facts, this only maps key → action.
 */
export function decideBubbleKey(key: string, opts: BubbleKeyOptions): BubbleKeyAction {
  if (key === 'Escape') return { type: 'close' };
  if (key === 'Enter') return { type: 'advance' };
  if (key === 'Tab') return opts.shiftKey ? { type: 'back' } : { type: 'advance' };
  if (key === 'ArrowUp') return { type: 'step', dir: 1 };
  if (key === 'ArrowDown') return { type: 'step', dir: -1 };
  if (key === 'ArrowLeft' && opts.atStart) return { type: 'hop-prev' };
  if (key === 'ArrowRight' && opts.atEnd) return { type: 'hop-next' };
  return { type: 'none' };
}

/** Whether an unrecognised option query should offer a "Create …" row. */
export function shouldOfferCreateOption(query: string, matches: readonly PickerOption[]): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  return !matches.some((m) => (m.label ?? m.path).toLowerCase() === trimmed.toLowerCase());
}

/** Filters a track's options down to only those the host says are currently held. */
export function filterHeldOptions(
  options: readonly PickerOption[],
  heldKeys: readonly string[] | null,
): PickerOption[] {
  if (heldKeys === null) return [...options];
  const held = new Set(heldKeys);
  return options.filter((o) => held.has(o.id));
}

/** Strips braces and line breaks from free text before it is written into a directive. */
export function sanitiseFreeText(raw: string): string {
  return raw.replace(/[{}]/g, '').replace(/\r\n|\r|\n/g, ' ');
}
