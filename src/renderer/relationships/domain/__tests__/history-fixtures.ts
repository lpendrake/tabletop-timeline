import type { DeltaOp } from '../../../../shared/relationships';
import type { HistoryEntry } from '../view-rows';

/** Seconds per fixture year: `at => Math.floor(at / YEAR)`. */
export const YEAR = 1000;
export const fixtureYearOf = (at: number): number => Math.floor(at / YEAR);

let counter = 0;

/** A history entry; `previousValue` and `runningValue` are the only required numbers. */
export function historyEntry(
  over: Partial<HistoryEntry> & { previousValue: number; runningValue: number },
  op: DeltaOp = { op: 'adjust', by: over.runningValue - over.previousValue },
): HistoryEntry {
  counter += 1;
  const at = over.at === undefined ? YEAR * 4724 + counter : over.at;
  return {
    key: `k${counter}`,
    at,
    dateLabel: at === null ? 'Undated note' : `day ${counter}`,
    delta: {
      ...op,
      at,
      declaredIn: { path: at === null ? 'notes/x.md' : 'timeline/night.md', ordinal: counter },
    },
    runningFormatted: String(over.runningValue),
    applied: true,
    mirrored: false,
    eventTitle: at === null ? null : 'Night of Ash',
    reason: 'Because',
    hit: null,
    ...over,
  };
}
