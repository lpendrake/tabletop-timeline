import { describe, it, expect, vi, afterEach } from 'vitest';

import * as currentValueModule from '../../../../shared/relationships/current-value';
import {
  resolveTrackSpec,
  pf2eReputationSpec,
  type Ledger,
} from '../../../../shared/relationships/index';
import { createValueCache } from '../value-cache';

const rp01 = resolveTrackSpec(pf2eReputationSpec);

function ledger(deltas: Ledger['deltas'] = []): Ledger {
  return { holder: 'aaaa', observer: 'bbbb', track: rp01.id, deltas };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('value cache hits for same ledger+now, misses for new ledger object or new now', () => {
  it('does not recompute for a repeat call with the same ledger and now', () => {
    const spy = vi.spyOn(currentValueModule, 'computeValueFromSorted');
    const cache = createValueCache();
    const l = ledger([{ op: 'adjust', by: 5, at: null, declaredIn: { path: 'a.md', ordinal: 0 } }]);

    cache.valueOf(l, rp01, 100);
    cache.valueOf(l, rp01, 100);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('recomputes when now changes', () => {
    const spy = vi.spyOn(currentValueModule, 'computeValueFromSorted');
    const cache = createValueCache();
    const l = ledger([{ op: 'adjust', by: 5, at: null, declaredIn: { path: 'a.md', ordinal: 0 } }]);

    cache.valueOf(l, rp01, 100);
    cache.valueOf(l, rp01, 200);

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('recomputes for a new ledger object even with identical contents', () => {
    const spy = vi.spyOn(currentValueModule, 'computeValueFromSorted');
    const cache = createValueCache();
    const l1 = ledger([
      { op: 'adjust', by: 5, at: null, declaredIn: { path: 'a.md', ordinal: 0 } },
    ]);
    const l2 = ledger([
      { op: 'adjust', by: 5, at: null, declaredIn: { path: 'a.md', ordinal: 0 } },
    ]);

    cache.valueOf(l1, rp01, 100);
    cache.valueOf(l2, rp01, 100);

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('valueOf uses the value-only path and never builds steps', () => {
    const currentValueSpy = vi.spyOn(currentValueModule, 'currentValue');
    const cache = createValueCache();
    const l = ledger([{ op: 'adjust', by: 5, at: null, declaredIn: { path: 'a.md', ordinal: 0 } }]);

    cache.valueOf(l, rp01, 100);

    expect(currentValueSpy).not.toHaveBeenCalled();
  });
});
