/**
 * Pure logic for the relationship-directive form popover: no IO, no React,
 * no CodeMirror. `extensions/relationship-directive-form-plugin.ts` wires
 * these into editor state and host IO; `extensions/relationship-directive-form.tsx`
 * wires them into the React component. Keeping this pure is what makes it
 * unit-testable without mounting a view — see CLAUDE.md's "no business logic
 * inside hooks/components".
 */
import type {
  ActionKind,
  ParsedDirective,
  Role,
  ResolvedTrack,
} from '../../../../shared/relationships';
import {
  validateRoleValue,
  noteIdOf,
  noteRoleValue,
  sanitiseValue,
} from '../../../../shared/relationships';
import { rankPickerOptions, recentsFirst, type PickerOption } from '../../searchable-picker';
import { compareRanked, rankEntityMatch, type MatchRank } from '../../entity-match';

/** The role tokens of a directive, in document (= template) order. */
export function formRoles(d: ParsedDirective): Role[] {
  return d.tokens.map((t) => t.role as Role);
}

/** The first item to focus on open: the first one `isEmpty` flags, or the first item overall if none are empty. */
export function firstOf<T>(items: readonly T[], isEmpty: (item: T) => boolean): T | null {
  const empty = items.find(isEmpty);
  if (empty !== undefined) return empty;
  return items[0] ?? null;
}

/** The role to focus when the form opens: the first empty blank, or the first blank if none are empty. */
export function firstEmptyRole(d: ParsedDirective): Role | null {
  const token = firstOf(d.tokens, (t) => t.value === '');
  return (token?.role as Role) ?? null;
}

/**
 * A role → current value snapshot from a directive's tokens — the form's
 * initial draft. `holder`/`observer` are un-wrapped to a bare note id (the
 * format every note-picker field and `storedValueFor('note', …)` deal in),
 * matching what the field would report back from `onChange`; every other
 * role keeps its raw token text as-is.
 */
export function buildInitialDraft(d: ParsedDirective): Partial<Record<Role, string>> {
  const draft: Partial<Record<Role, string>> = {};
  for (const t of d.tokens) {
    const role = t.role as Role;
    draft[role] =
      role === 'holder' || role === 'observer' ? (noteIdOf(t.value) ?? t.value) : t.value;
  }
  return draft;
}

/** Which kind of field a role renders as, given the directive's resolved track. */
export type FieldKind =
  | 'amount'
  | 'numeric-value'
  | 'ordinal-value'
  | 'note'
  | 'categorical-option'
  | 'reason'
  | 'unsupported';

export function fieldKindFor(role: Role, track: ResolvedTrack | null): FieldKind {
  if (role === 'amount') return 'amount';
  if (role === 'value' && track?.kind === 'ordinal') return 'ordinal-value';
  if (role === 'value' && track) return 'numeric-value';
  if (role === 'holder' || role === 'observer') return 'note';
  if (role === 'option' && track?.kind === 'categorical') return 'categorical-option';
  if (role === 'reason') return 'reason';
  return 'unsupported';
}

export type ValidationResult = { ok: true; value: string } | { ok: false; message: string };

/**
 * `amount` — any non-zero number, matching the track's step integrality.
 * Thin wrapper over the shared `validateRoleValue`, mapping its numeric
 * result to this field's string-based `ValidationResult`.
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

/**
 * Validates one field's draft text at Save time. An empty draft is always
 * valid — a directive is allowed to stay "unfinished" with required blanks
 * left empty, exactly as today. Only `amount`/`numeric-value` fields have
 * real, typed-in validation; every other kind's draft is already
 * well-formed by construction (a picked id/key, or free text).
 */
export function validateFormField(
  kind: FieldKind,
  track: ResolvedTrack | null,
  draftText: string,
): ValidationResult {
  const trimmed = draftText.trim();
  if (kind === 'amount') {
    if (trimmed === '') return { ok: true, value: '' };
    return track ? validateAmount(draftText, track) : { ok: false, message: 'Unknown track' };
  }
  if (kind === 'numeric-value') {
    if (trimmed === '') return { ok: true, value: '' };
    return track ? validateNumericValue(draftText, track) : { ok: false, message: 'Unknown track' };
  }
  return { ok: true, value: draftText };
}

/** The token text a validated draft should be stored as — the `note` kind wraps a bare id as `[[id]]`. */
export function storedValueFor(kind: FieldKind, validatedDraft: string): string {
  if (kind === 'reason') return sanitiseValue(validatedDraft);
  if (kind === 'note') return validatedDraft ? noteRoleValue(validatedDraft) : '';
  return validatedDraft;
}

function numericStep(track: ResolvedTrack): number {
  return track.kind === 'numeric' ? track.step || 1 : 1;
}

/** Whether a numeric field for `track` accepts a decimal point — mirrors `validateRoleValue`'s integer-step requirement. */
export function allowsFraction(track: ResolvedTrack | null): boolean {
  return !!track && track.kind === 'numeric' && !Number.isInteger(track.step || 1);
}

/**
 * Whether typed text is composed only of a numeric field's allowed
 * characters — the keystroke-level filter that keeps letters and other
 * junk out; `validateFormField` is what rejects an incomplete or
 * out-of-range value at Save time.
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

/**
 * The value a numeric field (`amount`, or `value` on a numeric track) should
 * start with when the directive's blank is empty: `1`, or — for `value` on a
 * numeric track when `1` falls outside its `[min, max]` — the track's own
 * `clamp(1)`.
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

/** Whether an unrecognised option query should offer a "Create …" row. */
export function shouldOfferCreateOption(query: string, matches: readonly PickerOption[]): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  return !matches.some((m) => (m.label ?? m.path).toLowerCase() === trimmed.toLowerCase());
}

/**
 * Whether an option blank's directive action can offer "Create …" at all.
 * Only an Add action mints a fresh option a note doesn't hold yet — a
 * Remove (`loses`) blank only ever picks among options the ledger already
 * shows as held.
 */
export function allowsCreateOption(actionKind: ActionKind | undefined): boolean {
  return actionKind === 'add';
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
 * The value a holder/observer picker should show pre-filled: the
 * directive's current draft value (a bare id extracted from its `[[id]]`
 * form), or — for an empty holder blank only — the host's default holder.
 */
export function prefillNoteValue(
  role: Role,
  value: string,
  defaultHolderId: string | null,
): string | undefined {
  const currentId = noteIdOf(value) ?? (value || undefined);
  return role === 'holder' && !currentId ? (defaultHolderId ?? undefined) : currentId;
}

interface RankedNoteOption {
  option: PickerOption;
  index: number;
  rank: MatchRank;
}

/**
 * Ranks note options the same way the `@` link search does (title/id
 * substring matching via `shared/entity-match.ts`'s `rankEntityMatch`), not
 * `rankPickerOptions`'s file-path-segment matching.
 */
export function rankNoteOptions(
  options: readonly PickerOption[],
  query: string,
  recentIds?: readonly string[],
): PickerOption[] {
  const q = query.trim();
  if (!q) return recentsFirst(options, recentIds);
  const ranked: RankedNoteOption[] = [];
  options.forEach((option, index) => {
    const rank = rankEntityMatch(option.label ?? option.path, option.id, q);
    if (rank !== null) ranked.push({ option, index, rank });
  });
  ranked.sort(compareRanked);
  return ranked.map((entry) => entry.option);
}

// Re-exported so field components that need the default (non-note) ranker
// don't have to reach into `../../searchable-picker` themselves.
export { rankPickerOptions };

/**
 * Computes the token edits a Save should apply: only the roles whose
 * validated, stored value actually differs from the directive's current
 * token text. Returns `null` for a role with no such token (defensive —
 * every role passed in should already be one of `d`'s tokens).
 */
export function changedRoles(
  d: ParsedDirective,
  storedDraft: Partial<Record<Role, string>>,
): Role[] {
  const changed: Role[] = [];
  for (const token of d.tokens) {
    const role = token.role as Role;
    const next = storedDraft[role];
    if (next !== undefined && next !== token.value) changed.push(role);
  }
  return changed;
}
