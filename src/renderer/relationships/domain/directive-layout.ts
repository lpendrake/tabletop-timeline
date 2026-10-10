/**
 * Pure geometry of a relationship directive as live text: where its blanks
 * (the only text a keystroke may land in) are, what is structure around
 * them, and whether a proposed document change stays inside the rules.
 *
 *   {{rp01.change Rep change: {amount:-2} {observer:[[a1]]} rep for {holder:} — {reason:}}}
 *   └ envelope ──┘└ wording ─┘└delim┘│  └┘ …                           │     └┘
 *                                    value                      empty value (a point)
 *
 * No CodeMirror, no React, no IO — `editor/directives.ts` turns this
 * into decorations, atomic ranges and a transaction filter.
 */
import {
  knownValueLabel,
  noteRoleValue,
  type ParsedDirective,
  type ResolvedTrack,
  type Role,
} from '../../../shared/relationships';

export interface Span {
  from: number;
  to: number;
}

/** One `{role:value}` token's value range. Empty values are a point (`from === to`). */
export interface ValueSlot {
  role: Role;
  tokenIndex: number;
  from: number;
  to: number;
  value: string;
}

export interface DirectiveLayout {
  /** `{{trackId.actionKey ` — shown as the track/action chip. */
  envelope: Span;
  /** The closing `}}`. */
  close: Span;
  /** Template wording between tokens: shown, never editable. */
  wording: Span[];
  /** Each token's `{role:` and `}`: hidden, never editable. */
  delimiters: Span[];
  slots: ValueSlot[];
  /**
   * Everything that isn't a value, merged into the stretches between values:
   * start → first value, value → value, last value → end. Treated as atomic
   * so the caret hops from one blank's edge straight to the next.
   */
  structure: Span[];
}

/** End of `{{trackId.actionKey ` (the parser requires exactly one space). */
export function envelopeEnd(d: ParsedDirective): number {
  return d.from + 2 + d.trackId.length + 1 + d.actionKey.length + 1;
}

export function directiveSlots(d: ParsedDirective): ValueSlot[] {
  return d.tokens.map((t, tokenIndex) => ({
    role: t.role as Role,
    tokenIndex,
    from: t.valueFrom,
    to: t.valueTo,
    value: t.value,
  }));
}

export function directiveLayout(d: ParsedDirective): DirectiveLayout {
  const envelope = { from: d.from, to: envelopeEnd(d) };
  const close = { from: d.to - 2, to: d.to };
  const wording: Span[] = [];
  const delimiters: Span[] = [];

  let pos = envelope.to;
  for (const segment of d.segments) {
    if (segment.kind === 'text') {
      wording.push({ from: pos, to: pos + segment.text.length });
      pos += segment.text.length;
      continue;
    }
    const token = d.tokens[segment.index];
    delimiters.push({ from: token.from, to: token.valueFrom });
    delimiters.push({ from: token.valueTo, to: token.to });
    pos = token.to;
  }

  const slots = directiveSlots(d);
  const structure: Span[] = [];
  let start = d.from;
  for (const slot of slots) {
    structure.push({ from: start, to: slot.from });
    start = slot.to;
  }
  structure.push({ from: start, to: d.to });

  return { envelope, close, wording, delimiters, slots, structure };
}

/** The slot `pos` sits in, ends inclusive (so an empty value's point counts). */
export function slotAt(d: ParsedDirective, pos: number): ValueSlot | null {
  return directiveSlots(d).find((s) => s.from <= pos && pos <= s.to) ?? null;
}

export interface SlotHit {
  directive: ParsedDirective;
  slot: ValueSlot;
}

export function slotHitAt(directives: readonly ParsedDirective[], pos: number): SlotHit | null {
  for (const directive of directives) {
    if (pos < directive.from || pos > directive.to) continue;
    const slot = slotAt(directive, pos);
    if (slot) return { directive, slot };
  }
  return null;
}

/**
 * The slot after (`dir = 1`) or before (`dir = -1`) `pos` in this directive:
 * the neighbour of the slot containing `pos`, or — when `pos` is in no slot —
 * the nearest slot in that direction. Null past either end.
 */
export function adjacentSlot(d: ParsedDirective, pos: number, dir: 1 | -1): ValueSlot | null {
  const slots = directiveSlots(d);
  const current = slots.findIndex((s) => s.from <= pos && pos <= s.to);
  if (current !== -1) return slots[current + dir] ?? null;
  if (dir === 1) return slots.find((s) => s.from > pos) ?? null;
  return [...slots].reverse().find((s) => s.to < pos) ?? null;
}

/** The first empty slot, else the first slot — where the caret goes on insert or a click on structure. */
export function firstEditSlot(d: ParsedDirective): ValueSlot | null {
  const slots = directiveSlots(d);
  return slots.find((s) => s.value === '') ?? slots[0] ?? null;
}

/** The slot whose range is nearest to `pos` (ties go to the earlier slot). */
export function nearestSlot(d: ParsedDirective, pos: number): ValueSlot | null {
  let best: ValueSlot | null = null;
  let bestDistance = Infinity;
  for (const slot of directiveSlots(d)) {
    const distance = pos < slot.from ? slot.from - pos : pos > slot.to ? pos - slot.to : 0;
    if (distance < bestDistance) {
      best = slot;
      bestDistance = distance;
    }
  }
  return best;
}

export type ChangeVerdict =
  /** Touches no protected directive. */
  | { kind: 'free' }
  /** Removes or replaces whole directives, nothing partial. */
  | { kind: 'whole' }
  /** Stays inside one value. */
  | { kind: 'value'; directive: ParsedDirective; slot: ValueSlot }
  /** Would edit structure (envelope, wording, delimiters) or straddle a boundary; `directive` is the first one it would break. */
  | { kind: 'blocked'; directive: ParsedDirective };

function touches(d: ParsedDirective, fromA: number, toA: number): boolean {
  if (fromA === toA) return d.from < fromA && fromA < d.to;
  return fromA < d.to && toA > d.from;
}

/**
 * Classifies one change (`fromA`–`toA` in the old document) against the
 * protected directives. Inserting right before or after a directive is free;
 * replacing it whole is fine; anything inside it must stay within one value
 * (ends inclusive, so typing into an empty blank is allowed).
 */
export function classifyChange(
  directives: readonly ParsedDirective[],
  fromA: number,
  toA: number,
): ChangeVerdict {
  const touched = directives.filter((d) => touches(d, fromA, toA));
  if (touched.length === 0) return { kind: 'free' };
  if (touched.every((d) => fromA <= d.from && toA >= d.to)) return { kind: 'whole' };
  if (touched.length === 1) {
    const directive = touched[0];
    const slot = directiveSlots(directive).find((s) => s.from <= fromA && toA <= s.to);
    if (slot) return { kind: 'value', directive, slot };
  }
  return { kind: 'blocked', directive: touched[0] };
}

export type ValueDisplay =
  | { kind: 'empty' }
  /** Shown as typed. */
  | { kind: 'text' }
  /** Stored as a key or link, shown as a label; edited as one unit. */
  | { kind: 'label'; label: string; noteId?: string };

/**
 * How a value reads. Note links, categorical option keys and ordinal rung
 * keys store an identifier but show a name, so they're a single unit: typing
 * over one replaces it rather than appending to the hidden key.
 */
export function valueDisplay(
  role: Role,
  value: string,
  track: ResolvedTrack | null,
  labelForNote: (id: string) => string,
): ValueDisplay {
  if (value === '') return { kind: 'empty' };
  const known = knownValueLabel(role, value, track, labelForNote);
  if (!known) return { kind: 'text' };
  // A note blank is one unit only when it holds exactly one link; anything
  // else in it (a typed query around a link) reads as the text it is.
  if (known.noteId && value !== noteRoleValue(known.noteId)) return { kind: 'text' };
  return { kind: 'label', ...known };
}

/** Whether a role offers a list of choices (notes, tags, rungs) rather than free text. */
export function roleHasChoices(role: Role, track: ResolvedTrack | null): boolean {
  if (role === 'holder' || role === 'observer') return true;
  if (role === 'option') return track?.kind === 'categorical';
  if (role === 'value') return track?.kind === 'ordinal';
  return false;
}
