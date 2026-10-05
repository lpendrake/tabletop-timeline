/**
 * Display formatting for relationship rows and history entries. Pure — no IO, no React.
 */
import type { DeltaOp, TrackValue } from '../../../shared/relationships/model';
import type { ResolvedTrack } from '../../../shared/relationships/resolve';
import type { HistoryEntry } from './view-rows';

const MINUS = '−';

/** Turns a raw value or option key into display text. */
export type ValueLabeller = (value: string) => string;

const RAW: ValueLabeller = (value) => value;

function valueText(value: TrackValue, label: ValueLabeller): string {
  return Array.isArray(value) ? value.map(label).join(', ') : label(String(value));
}

/** Labeller showing a track's own labels (rung / option); numeric values stay as typed. */
export function trackValueLabeller(track: ResolvedTrack): ValueLabeller {
  return track.kind === 'numeric' ? RAW : (value) => track.format(value);
}

/**
 * Signed amount for adjust (`+2`, `−3`), `= value` for set, `+ option` / `− option` for add / remove.
 * `label` turns rung / option keys into display text (raw keys by default).
 */
export function formatDeltaChange(delta: DeltaOp, label: ValueLabeller = RAW): string {
  switch (delta.op) {
    case 'adjust':
      return delta.by < 0 ? `${MINUS}${Math.abs(delta.by)}` : `+${delta.by}`;
    case 'set':
      return `= ${valueText(delta.value, label)}`;
    case 'add':
      return `+ ${label(delta.key)}`;
    case 'remove':
      return `${MINUS} ${label(delta.key)}`;
  }
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

/** CSS classes for a history entry (search tint/dim, future fade). */
export function historyEntryClasses(entry: Pick<HistoryEntry, 'hit' | 'applied'>): string {
  const classes = ['rel-entry'];
  if (entry.hit === true) classes.push('is-hit');
  if (entry.hit === false) classes.push('is-dim');
  if (!entry.applied) classes.push('is-future');
  return classes.join(' ');
}
