/**
 * Pure value logic for relationship directive blanks: validation, stepping,
 * ranking and filtering of choices. No IO, no React, no CodeMirror —
 * `editor/directives.ts` and `editor/directive-completions.ts`
 * wire these into the editor.
 */
import type { ActionKind, Role, ResolvedTrack } from '../../../shared/relationships';
import type { PickerOption } from '../../shared/searchable-picker';
import { compareRanked, rankEntityMatch, type MatchRank } from '../../shared/entity-match';
import { rankMatch } from '../../shared/search/rank';

function numericStep(track: ResolvedTrack): number {
  return track.kind === 'numeric' ? track.step || 1 : 1;
}

/**
 * Whether a blank that holds a number (`amount`, or `value` on a numeric
 * track) may contain `text` while it's being typed: an optional sign, digits,
 * and — only when the track's step is fractional — one decimal point. It
 * doesn't require a complete number (a lone `-` is fine mid-typing);
 * `interpretDirective` still flags an incomplete or out-of-range value.
 */
export function isNumericInputText(text: string, track: ResolvedTrack): boolean {
  const fractional = track.kind === 'numeric' && !Number.isInteger(track.step || 1);
  return (fractional ? /^[+-]?\d*\.?\d*$/ : /^[+-]?\d*$/).test(text);
}

/** Whether `role` on `track` holds a number. */
export function isNumericRole(role: Role, track: ResolvedTrack | null): boolean {
  return role === 'amount' || (role === 'value' && track?.kind === 'numeric');
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

/** Union of held tag keys across every observer in a Remove's `heldTags` lookup — the tag-first step's query. */
export function unionHeldTags(byObserver: ReadonlyMap<string, string[]>): string[] {
  const keys = new Set<string>();
  for (const held of byObserver.values()) {
    for (const key of held) keys.add(key);
  }
  return [...keys];
}

/** Observer ids (from a Remove's `heldTags` lookup) whose held tags include `tag` — the observer step's query. */
export function observersHoldingTag(
  byObserver: ReadonlyMap<string, string[]>,
  tag: string,
): string[] {
  const ids: string[] = [];
  for (const [observer, held] of byObserver) {
    if (held.includes(tag)) ids.push(observer);
  }
  return ids;
}

interface RankedOption {
  option: PickerOption;
  index: number;
  rank: MatchRank;
}

/** Note id to its proximity in seconds from the track's nearest entry; `null` = used but undated. Absent = not used. */
export type NoteUsage = ReadonlyMap<string, number | null>;

/** The holder/observer list's first section: notes the track already uses. */
export const USED_SECTION = { name: 'Used on this track', rank: 0 } as const;
/** The holder/observer list's second section: every other note. */
export const UNUSED_SECTION = { name: 'Not used on this track', rank: 1 } as const;
export type NoteSection = typeof USED_SECTION | typeof UNUSED_SECTION;

/** Nearest first; an undated proximity (`null`) after every dated one. */
export function compareProximity(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function noteLabel(option: PickerOption): string {
  return option.label ?? option.path;
}

/**
 * The note options that match `query` (title/id matching via
 * `shared/entity-match.ts`'s `rankEntityMatch`, like the `@` link search —
 * not file-path-segment matching, so "The Whispering Claw" is found by its
 * title), each with its match rank. An empty query matches every note with
 * the same rank. Input order is kept for ties.
 */
export function matchNoteOptions(options: readonly PickerOption[], query: string): RankedOption[] {
  const q = query.trim();
  const matches: RankedOption[] = [];
  options.forEach((option, index) => {
    const rank = q ? rankEntityMatch(noteLabel(option), option.id, q) : 0;
    if (rank !== null) matches.push({ option, index, rank });
  });
  return matches;
}

export interface SectionedNote {
  option: PickerOption;
  /** `null` for the pinned default holder, which sits above both sections. */
  section: NoteSection | null;
}

export interface NoteSectionInput {
  role: Role;
  /** Already narrowed (a Remove's observers); every note still listed is a candidate. */
  options: readonly PickerOption[];
  /** What's typed in the blank (empty when it holds a picked note). */
  query: string;
  /** The track's usage, or `null` when unknown (every note is then "not used"). */
  usage: NoteUsage | null;
  defaultHolderId: string | null;
}

/**
 * The note pinned as the first row of a blank, if any: the campaign's default
 * holder, on a holder blank with an empty query, when it is among `options`
 * (already narrowed). The one rule behind both the pinned row and Tab/Enter
 * picking it.
 */
export function pinnedDefaultHolder(input: {
  role: Role;
  query: string;
  defaultHolderId: string | null;
  options: readonly PickerOption[];
}): PickerOption | null {
  if (input.role !== 'holder' || input.query.trim() || !input.defaultHolderId) return null;
  return input.options.find((o) => o.id === input.defaultHolderId) ?? null;
}

/**
 * The notes a holder/observer blank offers, in final display order: the
 * default holder pinned first (`pinnedDefaultHolder`), then the used notes,
 * then the rest. The query filters and ranks within each section: the best
 * text match comes first, then used notes nearest in time (undated last) and
 * everything else A–Z, ties falling back to A–Z.
 */
export function sectionNotes(input: NoteSectionInput): SectionedNote[] {
  const matches = matchNoteOptions(input.options, input.query);
  const pinnedOption = pinnedDefaultHolder({ ...input, options: input.options });
  const pinned = pinnedOption ? matches.find((m) => m.option === pinnedOption) : undefined;

  const isUsed = (m: RankedOption) => Boolean(input.usage?.has(m.option.id));
  const proximity = (m: RankedOption) => input.usage?.get(m.option.id) ?? null;
  const byLabel = (a: RankedOption, b: RankedOption) =>
    noteLabel(a.option).localeCompare(noteLabel(b.option));

  const rest = matches.filter((m) => m !== pinned);
  const used = rest
    .filter(isUsed)
    .sort(
      (a, b) => a.rank - b.rank || compareProximity(proximity(a), proximity(b)) || byLabel(a, b),
    );
  const unused = rest.filter((m) => !isUsed(m)).sort((a, b) => a.rank - b.rank || byLabel(a, b));

  return [
    ...(pinned ? [{ option: pinned.option, section: null }] : []),
    ...used.map((m) => ({ option: m.option, section: USED_SECTION })),
    ...unused.map((m) => ({ option: m.option, section: UNUSED_SECTION })),
  ];
}

/**
 * Ranks labelled choices (tags, rungs) by their label the same way menu
 * search does (`shared/search/rank.ts`): prefix, then word-start, then
 * substring, keeping the given order for ties and for an empty query.
 */
export function rankLabelled(options: readonly PickerOption[], query: string): PickerOption[] {
  if (!query.trim()) return [...options];
  const ranked: RankedOption[] = [];
  options.forEach((option, index) => {
    const rank = rankMatch(option.label ?? option.path, query);
    if (rank !== null) ranked.push({ option, index, rank });
  });
  ranked.sort(compareRanked);
  return ranked.map((entry) => entry.option);
}
