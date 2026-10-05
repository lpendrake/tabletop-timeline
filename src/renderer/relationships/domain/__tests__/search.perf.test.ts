import { describe, it, expect } from 'vitest';
import type { Ledger, RelationshipDelta } from '../../../../shared/relationships/model';
import { historyEntryText, searchRows, type SearchableRow, type SearchScope } from '../search';

const SCOPES: SearchScope[] = ['name', 'band', 'event', 'reason'];

function buildLedger(seed: number): Ledger {
  const deltas: RelationshipDelta[] = [];
  for (let i = 0; i < 50; i++) {
    deltas.push({
      op: 'adjust',
      by: 1,
      at: i % 3 === 0 ? null : (i + seed) * 1000,
      declaredIn: { path: `event-${(seed + i) % 300}.md`, ordinal: i },
      reason: i % 2 === 0 ? `Reason number ${i} for holder ${seed}` : undefined,
    });
  }
  return { holder: `h${seed % 20}`, observer: `o${seed}`, track: 'rp01', deltas };
}

describe('PERF: searching 1,000 ledgers × 50 deltas with a title map finishes within one frame', () => {
  it('searches a two-word query touching history in under 16ms (best of 5)', () => {
    const ledgers = Array.from({ length: 1000 }, (_, i) => buildLedger(i));
    const titleByPath = new Map<string, string>();
    for (let i = 0; i < 300; i++) titleByPath.set(`event-${i}.md`, `Battle of place ${i}`);

    // Rows are built once per data change in the hook (memoised); a keystroke only re-runs the search.
    const rows: SearchableRow[] = ledgers.map((l, i) => ({
      key: `${l.holder}|${l.observer}|${l.track}`,
      fields: { name: `Observer ${i}`, band: 'Friendly' },
      history: l.deltas.map((d, j) => {
        const text = historyEntryText(d, titleByPath);
        return { key: String(j), event: text.event, reason: text.reason };
      }),
    }));

    const run = () => {
      const start = performance.now();
      const result = searchRows(rows, 'battle 999', SCOPES);
      const elapsed = performance.now() - start;
      expect(result.total).toBe(1000);
      return elapsed;
    };

    for (let i = 0; i < 3; i++) run(); // untimed warm-up so JIT compilation is not measured
    const durations = Array.from({ length: 5 }, run);
    durations.sort((a, b) => a - b);
    console.log(`search perf: best=${durations[0].toFixed(2)}ms`);
    expect(durations[0]).toBeLessThan(16);
  });
});
