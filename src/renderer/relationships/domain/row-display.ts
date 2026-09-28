/**
 * Display formatting for relationship rows and history entries. Pure — no IO, no React.
 */
import type { DeltaOp, TrackValue } from '../../../shared/relationships/model';
import type { HistoryEntry } from './view-rows';

const MINUS = '−';

function valueText(value: TrackValue): string {
  return Array.isArray(value) ? value.join(', ') : String(value);
}

/** Signed amount for adjust (`+2`, `−3`), `= value` for set, `+ option` / `− option` for add / remove. */
export function formatDeltaChange(delta: DeltaOp): string {
  switch (delta.op) {
    case 'adjust':
      return delta.by < 0 ? `${MINUS}${Math.abs(delta.by)}` : `+${delta.by}`;
    case 'set':
      return `= ${valueText(delta.value)}`;
    case 'add':
      return `+ ${delta.key}`;
    case 'remove':
      return `${MINUS} ${delta.key}`;
  }
}

/** Row "last change" text, e.g. `+2 23 Gozran 4725`. */
export function formatLastChange(last: { delta: DeltaOp; dateLabel: string }): string {
  return `${formatDeltaChange(last.delta)} ${last.dateLabel}`;
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
