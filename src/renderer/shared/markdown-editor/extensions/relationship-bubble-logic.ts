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

/** Whether a numeric field for `track` accepts a decimal point — mirrors `validateRoleValue`'s integer-step requirement (an ordinal track never reaches here; it uses `RungField` instead). */
export function allowsFraction(track: ResolvedTrack | null): boolean {
  return !!track && track.kind === 'numeric' && !Number.isInteger(track.step || 1);
}

/**
 * Whether typed text is composed only of a numeric field's allowed
 * characters — an optional leading sign, digits, and (only when `track`
 * allows fractional values) a single decimal point. This doesn't require
 * the text to already be a complete, valid number (e.g. a lone `-` or a
 * trailing `.` while still typing) — `validateAmount`/`validateNumericValue`
 * (both backed by the shared `validateRoleValue`) are what reject an
 * incomplete or out-of-range value at commit time. This is only the
 * keystroke-level filter that keeps letters and other junk out.
 */
export function isAllowedNumberInputText(text: string, track: ResolvedTrack | null): boolean {
  const pattern = allowsFraction(track) ? /^[+-]?\d*\.?\d*$/ : /^[+-]?\d*$/;
  return pattern.test(text);
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

/**
 * The value a numeric field (`amount`, or `value` on a numeric track) should
 * start with when the directive's blank is empty: `1`, or — for `value` on a
 * numeric track when `1` falls outside its `[min, max]` — the track's own
 * `clamp(1)`, i.e. whichever bound of the range is nearest to `1`. `amount`
 * is unbounded (see `stepAmount`), so it always starts at a plain `1`.
 */
export function initialNumberFieldValue(
  role: Role,
  value: string,
  track: ResolvedTrack | null,
): string {
  if (value !== '') return value;
  if (role === 'value' && track && track.kind === 'numeric') return String(track.clamp(1));
  return '1';
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

/**
 * Geometry for fitting the bubble (and its scrollable option list) above or
 * below its anchor line. Deliberately separate from
 * `../../context-menu/caret-position`'s `computeCaretPlacement`: that
 * helper only ever flips wholesale between a side that fits and one that
 * doesn't, with no notion of a shrinkable list — it can't be reused (or
 * edited; it's shared by other popups) for "shrink the list first, flip only
 * if that's not enough either". `EDGE_MARGIN`/`GAP` are duplicated from that
 * file's own (unexported) constants of the same name and meaning.
 */
const EDGE_MARGIN = 8;
const GAP = 2;

/** How many rows of the option list must stay visible after a shrink. */
export const MIN_VISIBLE_LIST_ROWS = 3;

export interface BubbleVerticalAnchors {
  /** CSS `top` (px, viewport coords) the bubble would use when placed below the line. */
  belowTop: number;
  /** Space available below the line (px), after margins. */
  below: number;
  /** CSS `bottom` (px, distance from the viewport's bottom edge) the bubble would use when placed above the line. */
  aboveBottom: number;
  /** Space available above the line (px), after margins. */
  above: number;
}

/** The vertical anchor points and available space on both sides of the anchor line. */
export function bubbleVerticalAnchors(
  lineTop: number,
  lineBottom: number,
  viewportHeight: number,
): BubbleVerticalAnchors {
  const belowTop = lineBottom + GAP;
  const aboveBottom = viewportHeight - lineTop + GAP;
  return {
    belowTop,
    below: Math.max(0, viewportHeight - EDGE_MARGIN - belowTop),
    aboveBottom,
    above: Math.max(0, lineTop - GAP - EDGE_MARGIN),
  };
}

export type BubbleSide = 'above' | 'below';

export interface BubbleFitPlan {
  side: BubbleSide;
  /** Max height (px) to give the option list so the whole bubble fits, or `null` when the list needs no shrinking. */
  listMaxHeight: number | null;
}

/**
 * Decides where the bubble should open and how much (if at all) to shrink
 * its option list, given the space available above/below its anchor line
 * (`bubbleVerticalAnchors`), the bubble's natural full height (list
 * unshrunk), the height everything but the list takes up ("chrome"), the
 * height of one list row, and the minimum rows that must stay visible after
 * a shrink (`MIN_VISIBLE_LIST_ROWS`).
 *
 * 1. Fits above at full height → stays above, no shrink.
 * 2. Doesn't fit above, but shrinking the list to `minVisibleRows` rows
 *    does → stays above, shrunk to exactly the space available.
 * 3. Still doesn't fit above → flips below: full height if there's room,
 *    otherwise shrunk to whatever's left (which may be under
 *    `minVisibleRows` — below is the last resort, there's nowhere else to
 *    flip to).
 */
export function planBubbleFit(
  space: Pick<BubbleVerticalAnchors, 'above' | 'below'>,
  fullHeight: number,
  chromeHeight: number,
  rowHeight: number,
  minVisibleRows: number = MIN_VISIBLE_LIST_ROWS,
): BubbleFitPlan {
  if (fullHeight <= space.above) return { side: 'above', listMaxHeight: null };

  const minAboveHeight = chromeHeight + rowHeight * minVisibleRows;
  if (minAboveHeight <= space.above) {
    return { side: 'above', listMaxHeight: space.above - chromeHeight };
  }

  if (fullHeight <= space.below) return { side: 'below', listMaxHeight: null };

  return { side: 'below', listMaxHeight: Math.max(0, space.below - chromeHeight) };
}

/** Clamps the bubble's `left` so it stays within the viewport, mirroring `caret-position.ts`'s own (unexported) `clampLeft`. */
export function clampBubbleLeft(caretX: number, popupWidth: number, viewportWidth: number): number {
  const max = viewportWidth - popupWidth - EDGE_MARGIN;
  return Math.max(EDGE_MARGIN, Math.min(caretX, max));
}
