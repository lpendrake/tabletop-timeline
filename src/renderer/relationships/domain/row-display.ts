/**
 * Display formatting for relationship rows and history entries. Pure — no IO, no React.
 */
import type { DeltaOp, TrackValue } from '../../../shared/relationships/model';
import type { ResolvedTrack } from '../../../shared/relationships/resolve';
import type { HistoryEntry } from './view-rows';

const MINUS = '−';
/** Joins the parts of a one-line summary. */
export const SEPARATOR = ' · ';
/** Significant digits kept when snapping floating-point results onto a tidy decimal. */
const TIDY_DIGITS = 12;

/** Turns a raw value or option key into display text. */
export type ValueLabeller = (value: string) => string;

const RAW: ValueLabeller = (value) => value;

function valueText(value: TrackValue, label: ValueLabeller): string {
  if (typeof value === 'number') return formatNumber(value);
  return Array.isArray(value) ? value.map(label).join(', ') : label(String(value));
}

/** Labeller showing a track's own labels (rung / option); numeric values stay as typed. */
export function trackValueLabeller(track: ResolvedTrack): ValueLabeller {
  return track.kind === 'numeric' ? RAW : (value) => track.format(value);
}

/** Removes floating-point noise (`0.30000000000000004` → `0.3`, `-0` → `0`). */
export function tidy(n: number): number {
  return Number(n.toPrecision(TIDY_DIGITS)) + 0;
}

/** A number as display text: float noise removed, negatives with U+2212 (`−16`). */
export function formatNumber(n: number): string {
  const tidied = tidy(n);
  return tidied < 0 ? `${MINUS}${Math.abs(tidied)}` : String(tidied);
}

/** A number with an explicit sign, `+18` or `−16` (U+2212); zero is a bare `0`. */
export function formatSigned(n: number): string {
  const text = formatNumber(n);
  return tidy(n) > 0 ? `+${text}` : text;
}

/**
 * Signed amount for adjust (`+2`, `−3`), `= value` for set, `+ option` / `− option` for add / remove.
 * `label` turns rung / option keys into display text (raw keys by default).
 */
export function formatDeltaChange(delta: DeltaOp, label: ValueLabeller = RAW): string {
  switch (delta.op) {
    case 'adjust':
      return formatSigned(delta.by);
    case 'set':
      return `= ${valueText(delta.value, label)}`;
    case 'add':
      return `+ ${label(delta.key)}`;
    case 'remove':
      return `${MINUS} ${label(delta.key)}`;
  }
}

export type ChangeTone = 'positive' | 'negative' | 'neutral';

/** Direction of a number: positive, negative, or neutral for zero. */
export function numberTone(n: number): ChangeTone {
  const tidied = tidy(n);
  return tidied === 0 ? 'neutral' : tidied > 0 ? 'positive' : 'negative';
}

/** Direction of a change: only an adjust by a non-zero amount is positive or negative. */
export function deltaTone(delta: DeltaOp): ChangeTone {
  return delta.op === 'adjust' ? numberTone(delta.by) : 'neutral';
}

/** Row "last change" text, e.g. `+2 23 Gozran 4725`. */
export function formatLastChange(
  last: { delta: DeltaOp; dateLabel: string },
  label: ValueLabeller = RAW,
): string {
  return `${formatDeltaChange(last.delta, label)} ${last.dateLabel}`;
}

/** The `RowMove` for a row dropped before/after a target row. */
export function dropToMove(
  position: 'before' | 'after',
  targetId: string,
): { before: string } | { after: string } {
  return position === 'before' ? { before: targetId } : { after: targetId };
}

/** Class suffix marking the insertion edge of a row being dragged over: `''`, `' drop-before'` or `' drop-after'`. */
export function dropIndicatorClass(indicator: 'before' | 'after' | null): string {
  return indicator ? ` drop-${indicator}` : '';
}

/** CSS classes for a history entry (search tint/dim, future fade) on top of `base`. */
export function historyEntryClasses(
  entry: Pick<HistoryEntry, 'hit' | 'applied'>,
  base = 'rel-entry',
): string {
  const classes = [base];
  if (entry.hit === true) classes.push('is-hit');
  if (entry.hit === false) classes.push('is-dim');
  if (!entry.applied) classes.push('is-future');
  return classes.join(' ');
}
