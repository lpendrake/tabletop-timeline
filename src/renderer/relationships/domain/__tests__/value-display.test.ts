import { describe, it, expect } from 'vitest';

import {
  resolveTrackSpec,
  pf2eReputationSpec,
  attitudeSpec,
  relationshipTagsSpec,
} from '../../../../shared/relationships/index';
import { valueDisplay } from '../value-display';

const rp01 = resolveTrackSpec(pf2eReputationSpec);
const at01 = resolveTrackSpec(attitudeSpec);
const tg01 = resolveTrackSpec(relationshipTagsSpec);

describe('valueDisplay: bar for banded numeric, ladder for ordinal, chips with mutual flag', () => {
  it('rp01 (banded numeric) renders as a bar with a fraction and band positions', () => {
    const display = valueDisplay(rp01, 12);
    expect(display.kind).toBe('bar');
    if (display.kind !== 'bar') throw new Error('unreachable');
    // range is [-50, 50], value 12 -> (12 - -50) / 100 = 0.62
    expect(display.fraction).toBeCloseTo(0.62, 5);
    expect(display.bands).toHaveLength(rp01.kind === 'numeric' ? rp01.bands.length : 0);
    expect(display.bands[0]).toEqual({ key: 'hunted', label: 'Hunted', startFraction: 0 });
    expect(display.label).toBe(rp01.format(12));
  });

  it('at01 (ordinal) renders as a ladder with the current rung active', () => {
    const display = valueDisplay(at01, 'friendly');
    expect(display.kind).toBe('ladder');
    if (display.kind !== 'ladder') throw new Error('unreachable');
    expect(display.rungs).toHaveLength(5);
    const active = display.rungs.filter((r) => r.active);
    expect(active).toHaveLength(1);
    expect(active[0].key).toBe('friendly');
  });

  it('tg01 (categorical) renders as chips, flagging mutual options', () => {
    const display = valueDisplay(tg01, ['employee', 'married']);
    expect(display.kind).toBe('chips');
    if (display.kind !== 'chips') throw new Error('unreachable');
    expect(display.chips).toEqual([
      { key: 'employee', label: 'employee', mutual: false },
      { key: 'married', label: 'married', mutual: true },
    ]);
  });

  it('an unbanded numeric track renders as a plain number', () => {
    const noBands = resolveTrackSpec({ ...pf2eReputationSpec, bands: undefined });
    const display = valueDisplay(noBands, 12);
    expect(display).toEqual({ kind: 'number', label: noBands.format(12) });
  });
});
