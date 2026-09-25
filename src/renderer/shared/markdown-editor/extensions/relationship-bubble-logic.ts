/**
 * Pure logic for the relationship-directive fill-in bubble: no IO, no React,
 * no CodeMirror. `extensions/relationship-bubble-state.ts` wires these into
 * editor state; `extensions/relationship-bubble.tsx` wires them into the
 * React component. Keeping this pure is what makes it unit-testable without
 * mounting a view (see CLAUDE.md — no business logic inside hooks/components).
 */
import type { ParsedDirective, Role, ResolvedTrack } from '../../../../shared/relationships';
import { validateRoleValue, noteIdOf } from '../../../../shared/relationships';
import { rankPickerOptions, type PickerOption } from '../../searchable-picker';

/** How a bubble field commit should move the bubble: to the next/previous blank, or hop over a filled one. */
export type BubbleCommitDirection = 'advance' | 'back' | 'hop-next' | 'hop-prev';

/** The role tokens of a directive, in document order (= template order at fill time). */
export function blankRoles(d: ParsedDirective): Role[] {
  return d.tokens.map((t) => t.role as Role);
}

/**
 * The first item to open/edit: the first one `isEmpty` flags, or the first
 * item overall if none are empty. Shared by `firstBlankRole` (over a
 * directive's tokens) and `relationship-directives.ts`'s `firstEditRole`
 * (over its already-built `ReadablePart`s).
 */
export function firstOf<T>(items: readonly T[], isEmpty: (item: T) => boolean): T | null {
  const empty = items.find(isEmpty);
  if (empty !== undefined) return empty;
  return items[0] ?? null;
}

/** The first blank to open: the first empty one, or the first blank if none are empty. */
export function firstBlankRole(d: ParsedDirective): Role | null {
  const token = firstOf(d.tokens, (t) => t.value === '');
  return (token?.role as Role) ?? null;
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

/**
 * `amount` — any non-zero number, matching the track's step integrality.
 * Thin wrapper over the shared `validateRoleValue` (see AGENTS.md), mapping
 * its numeric result to this field's string-based `ValidationResult`.
 */
export function validateAmount(raw: string, track: ResolvedTrack): ValidationResult {
  const result = validateRoleValue('amount', raw, track);
  return result.ok ? { ok: true, value: String(result.value) } : result;
}

/** `value` on a numeric track — a number within [min, max], matching the track's step integrality. */
export function validateNumericValue(raw: string, track: ResolvedTrack): ValidationResult {
  const result = validateRoleValue('value', raw, track);
  return result.ok ? { ok: true, value: String(result.value) } : result;
}

function numericStep(track: ResolvedTrack): number {
  return track.kind === 'numeric' ? track.step || 1 : 1;
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
  if (track.kind !== 'ordinal') return raw;
  const idx = track.rungIndex(raw);
  const rungs = track.rungs;
  if (rungs.length === 0) return raw;
  const from = idx >= 0 ? idx : 0;
  const next = Math.max(0, Math.min(rungs.length - 1, from + dir));
  return rungs[next].key;
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

/** Whether picking a note for `role` should notify the host it chose a holder before any default holder was set. */
export function shouldNotifyHolderChosen(role: Role, defaultHolderId: string | null): boolean {
  return role === 'holder' && !defaultHolderId;
}

/** Recent note ids for a holder/observer picker: `currentNoteId` pinned to the front if not already present. */
export function buildNotePickerRecents(
  recentNoteIds: readonly string[],
  currentNoteId: string | null,
): string[] {
  const recents = [...recentNoteIds];
  if (currentNoteId && !recents.includes(currentNoteId)) recents.unshift(currentNoteId);
  return recents;
}

/**
 * The value a holder/observer picker should show pre-filled: the directive's
 * current value (a bare id extracted from its `[[id]]` form), or — for an
 * empty holder blank only — the host's default holder.
 */
export function prefillNoteValue(
  role: Role,
  value: string,
  defaultHolderId: string | null,
): string | undefined {
  const currentId = noteIdOf(value) ?? (value || undefined);
  return role === 'holder' && !currentId ? (defaultHolderId ?? undefined) : currentId;
}

/**
 * The option Tab should commit for a picker-backed field: the query's top
 * ranked match, or (an empty query) the currently-selected value if it still
 * ranks among the recents/options shown.
 */
export function pickForTab(
  options: readonly PickerOption[],
  query: string,
  recentIds: readonly string[] | undefined,
  value: string | null | undefined,
): PickerOption | null {
  const ranked = rankPickerOptions(options, query, recentIds);
  if (!query.trim() && value) {
    const matched = ranked.find((o) => o.id === value);
    if (matched) return matched;
  }
  return ranked[0] ?? null;
}

/** Minimum distance kept between the bubble's tail and either of its own edges. */
export const TAIL_EDGE_INSET = 14;

/**
 * Where the bubble's tail should sit, as a horizontal offset (px) from the
 * bubble's own left edge, so it visually points at the blank's rendered
 * horizontal centre. Clamped to stay within the bubble's box (inset from
 * both edges by `inset`, matching the tail's own footprint and the box's
 * rounded corners) — the blank can sit outside the bubble's final,
 * viewport-clamped position (e.g. near a screen edge), and the tail must
 * still point somewhere on the box rather than sliding off it.
 */
export function computeTailOffset(
  blankCenterX: number,
  bubbleLeft: number,
  bubbleWidth: number,
  inset: number = TAIL_EDGE_INSET,
): number {
  const raw = blankCenterX - bubbleLeft;
  const max = Math.max(inset, bubbleWidth - inset);
  return Math.min(max, Math.max(inset, raw));
}
