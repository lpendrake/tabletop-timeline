/**
 * Pure value logic for relationship directive blanks: validation, stepping,
 * ranking and filtering of choices. No IO, no React, no CodeMirror —
 * `relationship-directives.ts` and `relationship-directive-completions.ts`
 * wire these into the editor.
 */
import type { ActionKind, Role, ResolvedTrack } from '../../../../shared/relationships';
import { recentsFirst, type PickerOption } from '../../searchable-picker';
import { compareRanked, rankEntityMatch, type MatchRank } from '../../entity-match';

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
 * shows as held, so typing an unrecognised tag there must never create one
 * (creating on a `loses` blank silently wrote a duplicate, e.g.
 * `married-2`, instead of just failing to match). `undefined` (unresolved
 * track/action) is treated as "no", matching the current default of not
 * offering create when the action can't be determined.
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

interface RankedNoteOption {
  option: PickerOption;
  index: number;
  rank: MatchRank;
}

/**
 * Ranks note options the same way the `@` link search does (title/id
 * substring matching via `shared/entity-match.ts`'s `rankEntityMatch`), not
 * `rankPickerOptions`'s file-path-segment matching — a note titled "The
 * Whispering Claw" needs to be found by typing its title, not by segments
 * of its file path. Passed to `SearchablePicker`'s `rank` prop by
 * `NotePickerField` below; the folder picker (and every other
 * `SearchablePicker` caller) keeps `rankPickerOptions` by not passing this.
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

export interface NoteChoiceInput {
  role: Role;
  options: readonly PickerOption[];
  /** What's typed in the blank (empty when it holds a picked note). */
  query: string;
  recentNoteIds: readonly string[];
  currentNoteId: string | null;
  defaultHolderId: string | null;
  /** Ids to restrict to (a Remove's observer), or null for every note. */
  restrictedIds: readonly string[] | null;
}

/**
 * The notes a holder/observer blank offers, best first: filtered by
 * `restrictedIds`, ranked by title like `@` links, with recents (the open
 * note pinned first, and for a holder the default holder ahead of that)
 * leading an empty query.
 */
export function noteChoices(input: NoteChoiceInput): PickerOption[] {
  const options = filterHeldOptions(input.options, input.restrictedIds);
  const recents = buildNotePickerRecents(input.recentNoteIds, input.currentNoteId);
  if (input.role === 'holder' && input.defaultHolderId) {
    const without = recents.filter((id) => id !== input.defaultHolderId);
    return rankNoteOptions(options, input.query, [input.defaultHolderId, ...without]);
  }
  return rankNoteOptions(options, input.query, recents);
}

/** Ranks labelled choices (tags, rungs) by a case-insensitive label match: prefix matches first, then substring. */
export function rankLabelled(options: readonly PickerOption[], query: string): PickerOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...options];
  const label = (o: PickerOption) => (o.label ?? o.path).toLowerCase();
  const prefix = options.filter((o) => label(o).startsWith(q));
  const rest = options.filter((o) => !label(o).startsWith(q) && label(o).includes(q));
  return [...prefix, ...rest];
}
