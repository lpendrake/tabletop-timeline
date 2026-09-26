import { describe, it, expect } from 'vitest';

import {
  resolveTrackSpec,
  pf2eReputationSpec,
  currentValue,
  type Ledger,
} from '../../../../shared/relationships/index';
import { buildStepRows } from '../step-rows';

const rp01 = resolveTrackSpec(pf2eReputationSpec);

describe('step rows mark future, reset and mirrored steps', () => {
  it('carries applied/future, reset and mirrored flags through to each row', () => {
    const ledger: Ledger = {
      holder: 'aaaa',
      observer: 'bbbb',
      track: rp01.id,
      deltas: [
        { op: 'adjust', by: 10, at: 50, declaredIn: { path: 'a.md', ordinal: 0 } },
        { op: 'set', value: 30, at: 200, declaredIn: { path: 'b.md', ordinal: 1 } },
        {
          op: 'adjust',
          by: 3,
          at: 50,
          declaredIn: { path: 'c.md', ordinal: 2 },
          mirrored: true,
          reason: 'eloped',
        },
      ],
    };

    const { steps } = currentValue(ledger, rp01, 100);
    const rows = buildStepRows(steps, rp01);

    expect(rows).toHaveLength(3);

    const applied = rows.find((r) => r.declaredIn.path === 'a.md')!;
    expect(applied.applied).toBe(true);
    expect(applied.reset).toBe(false);
    expect(applied.mirrored).toBe(false);
    expect(applied.key).toBe('a.md#0');
    expect(applied.formattedRunning).toBe(rp01.format(10));

    const future = rows.find((r) => r.declaredIn.path === 'b.md')!;
    expect(future.applied).toBe(false); // at 200 > now 100
    expect(future.reset).toBe(true); // 'set' op
    expect(future.at).toBe(200);

    const mirrored = rows.find((r) => r.declaredIn.path === 'c.md')!;
    expect(mirrored.mirrored).toBe(true);
    expect(mirrored.key).toBe('c.md#2~m');
    expect(mirrored.reason).toBe('eloped');
  });
});
