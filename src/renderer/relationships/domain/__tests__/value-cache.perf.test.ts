import { describe, it, expect } from 'vitest';

import {
  resolveTrackSpec,
  pf2eReputationSpec,
  type Ledger,
  type RelationshipDelta,
} from '../../../../shared/relationships/index';
import { createValueCache } from '../value-cache';

const rp01 = resolveTrackSpec(pf2eReputationSpec);

function buildLedger(seed: number): Ledger {
  const deltas: RelationshipDelta[] = [];
  for (let i = 0; i < 50; i++) {
    const dated = i % 3 !== 0;
    if (i % 5 === 0) {
      deltas.push({
        op: 'set',
        value: ((seed + i) % 100) - 50,
        at: dated ? (i + seed) * 1000 : null,
        declaredIn: { path: `note-${seed}.md`, ordinal: i },
      });
    } else {
      deltas.push({
        op: 'adjust',
        by: ((seed + i) % 7) - 3,
        at: dated ? (i + seed) * 1000 : null,
        declaredIn: { path: `note-${seed}.md`, ordinal: i },
      });
    }
  }
  return { holder: 'aaaa', observer: `o${seed % 10}`, track: rp01.id, deltas };
}

describe('PERF: recomputes 1,000 ledgers x 50 deltas within one frame', () => {
  it('re-folds all ledgers for a new now in under 16ms (best of several timed passes)', () => {
    const ledgers = Array.from({ length: 1000 }, (_, i) => buildLedger(i));
    const cache = createValueCache();

    // Warm up once at an initial `now` so sorted-delta caches are built.
    for (const ledger of ledgers) cache.valueOf(ledger, rp01, 0);

    const durations: number[] = [];
    for (let pass = 0; pass < 5; pass++) {
      const now = 1000 * (pass + 1);
      const start = performance.now();
      for (const ledger of ledgers) {
        cache.valueOf(ledger, rp01, now);
      }
      durations.push(performance.now() - start);
    }

    durations.sort((a, b) => a - b);
    const median = durations[Math.floor(durations.length / 2)];
    const best = durations[0];

    console.log(`value cache perf: best=${best.toFixed(2)}ms median=${median.toFixed(2)}ms`);

    expect(best).toBeLessThan(16);
  });
});
