import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import fc from 'fast-check';

import {
  resolveTrackSpec,
  validateTrackSpec,
  validateTemplate,
  compileTrack,
  requiredRoles,
  SYSTEM_TRACKS,
  pf2eReputationSpec,
  attitudeSpec,
  relationshipTagsSpec,
  compareDeltas,
  currentValue,
  resolveTrack,
  listTracks,
  type TrackLibrary,
  type RelationshipDelta,
  type Ledger,
  type NumericTrackSpec,
  type OrdinalTrackSpec,
  type TrackValue,
  type ResolvedTrack,
} from '../index.js';

function asOrdinal(track: ResolvedTrack): Extract<ResolvedTrack, { kind: 'ordinal' }> {
  if (track.kind !== 'ordinal') throw new Error('expected an ordinal track');
  return track;
}

function asCategorical(track: ResolvedTrack): Extract<ResolvedTrack, { kind: 'categorical' }> {
  if (track.kind !== 'categorical') throw new Error('expected a categorical track');
  return track;
}

const pf2eReputation = resolveTrackSpec(pf2eReputationSpec);
const attitude = asOrdinal(resolveTrackSpec(attitudeSpec));
const relationshipTags = asCategorical(resolveTrackSpec(relationshipTagsSpec));

function delta(
  partial: Partial<RelationshipDelta> & Pick<RelationshipDelta, 'op'>,
): RelationshipDelta {
  return {
    at: null,
    declaredIn: { path: 'a.md', ordinal: 0 },
    ...partial,
  } as RelationshipDelta;
}

describe('PF2E Reputation labels every band boundary', () => {
  const cases: [number, string][] = [
    [-50, 'Hunted'],
    [-30, 'Hunted'],
    [-29, 'Hated'],
    [-15, 'Hated'],
    [-14, 'Disliked'],
    [-5, 'Disliked'],
    [-4, 'Ignored'],
    [4, 'Ignored'],
    [5, 'Liked'],
    [14, 'Liked'],
    [15, 'Admired'],
    [29, 'Admired'],
    [30, 'Revered'],
    [50, 'Revered'],
  ];

  it.each(cases)('labels %i as %s', (value, label) => {
    expect(pf2eReputation.labelFor(value)).toBe(label);
  });

  it('clamps values outside [-50, 50]', () => {
    expect(pf2eReputation.clamp(51)).toBe(50);
    expect(pf2eReputation.clamp(-51)).toBe(-50);
  });
});

describe('format shows value and band / band only / rung / tag list', () => {
  it('numeric with showValue true shows value and band', () => {
    expect(pf2eReputation.format(12)).toBe('12 (Liked)');
  });

  it('numeric with showValue false shows band only', () => {
    const noValueTrack = resolveTrackSpec({ ...pf2eReputationSpec, showValue: false });
    expect(noValueTrack.format(12)).toBe('Liked');
  });

  it('ordinal shows rung label', () => {
    expect(attitude.format('friendly')).toBe('Friendly');
  });

  it('categorical joins option labels', () => {
    expect(relationshipTags.format(['employee', 'married'])).toBe('employee, married');
  });

  it('categorical with no selection formats as empty string', () => {
    expect(relationshipTags.format([])).toBe('');
  });
});

describe('numeric supports unbounded ranges and no bands', () => {
  const unbounded: NumericTrackSpec = {
    kind: 'numeric',
    id: 'un01',
    name: 'Unbounded',
    min: null,
    max: null,
    initial: 0,
    step: 1,
    showValue: true,
    actions: [
      {
        key: 'set',
        label: 'Set',
        kind: 'set',
        template: "Set: {holder}'s track with {observer} is {value} — {reason}",
      },
    ],
  };
  const track = resolveTrackSpec(unbounded);

  it('does not clamp when min/max are null', () => {
    expect(track.clamp(1_000_000)).toBe(1_000_000);
    expect(track.clamp(-1_000_000)).toBe(-1_000_000);
  });

  it('formats as just the number with no bands', () => {
    expect(track.format(42)).toBe('42');
  });
});

describe('rejects out-of-order, duplicate or out-of-bounds band starts', () => {
  function withBands(bands: NumericTrackSpec['bands']): NumericTrackSpec {
    return { ...pf2eReputationSpec, bands };
  }

  it('rejects out-of-order starts', () => {
    const result = validateTrackSpec(
      withBands([
        { key: 'a', label: 'A', start: -50 },
        { key: 'b', label: 'B', start: -60 },
      ]),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects duplicate starts', () => {
    const result = validateTrackSpec(
      withBands([
        { key: 'a', label: 'A', start: -50 },
        { key: 'b', label: 'B', start: -50 },
      ]),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a start outside [min, max]', () => {
    const result = validateTrackSpec(
      withBands([
        { key: 'a', label: 'A', start: -50 },
        { key: 'b', label: 'B', start: 999 },
      ]),
    );
    expect(result.ok).toBe(false);
  });
});

describe('accepts every built-in template', () => {
  for (const spec of SYSTEM_TRACKS) {
    for (const action of spec.actions) {
      it(`${spec.id}/${action.key} validates`, () => {
        expect(validateTemplate(action, spec.kind)).toEqual({ ok: true });
      });
    }
  }
});

describe('rejects missing role / missing reason / duplicate / unknown role / role kind mismatch', () => {
  it('missing required role', () => {
    const result = validateTemplate(
      { kind: 'adjust', template: '{holder} changes {amount:Amount} — {reason}' },
      'numeric',
    );
    expect(result).toEqual({ ok: false, errors: [{ code: 'missing-role', role: 'observer' }] });
  });

  it('missing reason', () => {
    const result = validateTemplate(
      { kind: 'adjust', template: '{holder} and {observer} change by {amount:Amount}' },
      'numeric',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual({ code: 'missing-reason', role: 'reason' });
    }
  });

  it('duplicate role', () => {
    const result = validateTemplate(
      {
        kind: 'adjust',
        template: '{holder} and {holder} and {observer} change by {amount:Amount} — {reason}',
      },
      'numeric',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual({ code: 'duplicate-role', role: 'holder' });
    }
  });

  it('unknown role', () => {
    const result = validateTemplate(
      { kind: 'adjust', template: '{holder} {observer} {amount:Amount} {reason} {nonsense}' },
      'numeric',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual({ code: 'unknown-role', role: 'nonsense' });
    }
  });

  it('role the action kind does not use', () => {
    const result = validateTemplate(
      { kind: 'adjust', template: '{holder} {observer} {amount:Amount} {reason} {value}' },
      'numeric',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual({ code: 'role-not-used-by-kind', role: 'value' });
    }
  });
});

describe('requiredRoles', () => {
  it('add/remove only apply to categorical', () => {
    expect(requiredRoles('add', 'numeric')).toEqual([]);
    expect(requiredRoles('add', 'categorical')).toEqual(['holder', 'observer', 'option', 'reason']);
  });
});

describe('orders undated first by path then ordinal, then by at with path/ordinal ties', () => {
  it('sorts as documented', () => {
    const d1 = delta({ op: 'adjust', by: 1, at: null, declaredIn: { path: 'b.md', ordinal: 0 } });
    const d2 = delta({ op: 'adjust', by: 1, at: null, declaredIn: { path: 'a.md', ordinal: 5 } });
    const d3 = delta({ op: 'adjust', by: 1, at: null, declaredIn: { path: 'a.md', ordinal: 1 } });
    const d4 = delta({ op: 'adjust', by: 1, at: 100, declaredIn: { path: 'z.md', ordinal: 0 } });
    const d5 = delta({ op: 'adjust', by: 1, at: 50, declaredIn: { path: 'z.md', ordinal: 0 } });
    const d6 = delta({ op: 'adjust', by: 1, at: 50, declaredIn: { path: 'a.md', ordinal: 0 } });
    const d7 = delta({ op: 'adjust', by: 1, at: 50, declaredIn: { path: 'a.md', ordinal: 2 } });

    const sorted = [d1, d2, d3, d4, d5, d6, d7].sort(compareDeltas);
    expect(sorted).toEqual([d3, d2, d1, d6, d7, d5, d4]);
  });
});

describe("future deltas appear in steps unapplied and don't affect value", () => {
  it('marks future deltas applied: false and excludes them from value', () => {
    const ledger: Ledger = {
      holder: 'aaaa',
      observer: 'bbbb',
      track: pf2eReputation.id,
      deltas: [
        delta({ op: 'adjust', by: 10, at: 100, declaredIn: { path: 'a.md', ordinal: 0 } }),
        delta({ op: 'adjust', by: 10, at: 200, declaredIn: { path: 'a.md', ordinal: 1 } }),
      ],
    };
    const result = currentValue(ledger, pf2eReputation, 150);
    expect(result.value).toBe(10);
    expect(result.steps[0].applied).toBe(true);
    expect(result.steps[1].applied).toBe(false);
    expect(result.steps[1].runningValue).toBe(20);
  });
});

describe('set is a reset point and is marked in steps', () => {
  it('marks reset: true and resets the running value', () => {
    const ledger: Ledger = {
      holder: 'aaaa',
      observer: 'bbbb',
      track: pf2eReputation.id,
      deltas: [
        delta({ op: 'adjust', by: 10, declaredIn: { path: 'a.md', ordinal: 0 } }),
        delta({ op: 'set', value: 3, declaredIn: { path: 'a.md', ordinal: 1 } }),
      ],
    };
    const result = currentValue(ledger, pf2eReputation, Infinity);
    expect(result.value).toBe(3);
    expect(result.steps[1].reset).toBe(true);
    expect(result.steps[1].runningValue).toBe(3);
    expect(result.steps[0].reset).toBe(false);
  });
});

describe('clamps at every step', () => {
  it('clamps intermediate values, not just the final one', () => {
    const ledger: Ledger = {
      holder: 'aaaa',
      observer: 'bbbb',
      track: pf2eReputation.id,
      deltas: [
        delta({ op: 'adjust', by: 40, declaredIn: { path: 'a.md', ordinal: 0 } }),
        delta({ op: 'adjust', by: 40, declaredIn: { path: 'a.md', ordinal: 1 } }),
        delta({ op: 'adjust', by: -10, declaredIn: { path: 'a.md', ordinal: 2 } }),
      ],
    };
    const result = currentValue(ledger, pf2eReputation, Infinity);
    expect(result.steps.map((s) => s.runningValue)).toEqual([40, 50, 40]);
    expect(result.value).toBe(40);
  });
});

describe('property: value at now=Infinity equals folding the whole sorted list', () => {
  it('matches a naive left-fold over the sorted deltas', () => {
    const numericDelta = fc.oneof(
      fc.record({ op: fc.constant('adjust' as const), by: fc.integer({ min: -100, max: 100 }) }),
      fc.record({ op: fc.constant('set' as const), value: fc.integer({ min: -50, max: 50 }) }),
    );
    const ordinalDelta = fc.oneof(
      fc.record({ op: fc.constant('adjust' as const), by: fc.integer({ min: -6, max: 6 }) }),
      fc.record({
        op: fc.constant('set' as const),
        value: fc.constantFrom('hostile', 'unfriendly', 'indifferent', 'friendly', 'helpful'),
      }),
    );
    const categoricalDelta = fc.oneof(
      fc.record({
        op: fc.constant('add' as const),
        key: fc.constantFrom('member', 'employee', 'married'),
      }),
      fc.record({
        op: fc.constant('remove' as const),
        key: fc.constantFrom('member', 'employee', 'married'),
      }),
      fc.record({
        op: fc.constant('set' as const),
        value: fc.array(fc.constantFrom('member', 'employee', 'married'), { maxLength: 3 }),
      }),
    );

    const tracks = [
      { track: pf2eReputation, opArb: numericDelta },
      { track: attitude, opArb: ordinalDelta },
      { track: relationshipTags, opArb: categoricalDelta },
    ];

    for (const { track, opArb } of tracks) {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              op: opArb,
              ordinal: fc.integer({ min: 0, max: 1000 }),
            }),
            { minLength: 0, maxLength: 20 },
          ),
          (entries) => {
            const deltas: RelationshipDelta[] = entries.map((e, i) =>
              delta({
                ...(e.op as Partial<RelationshipDelta> & Pick<RelationshipDelta, 'op'>),
                declaredIn: { path: 'a.md', ordinal: e.ordinal ?? i },
              }),
            );
            const ledger: Ledger = { holder: 'aaaa', observer: 'bbbb', track: track.id, deltas };
            const viaCurrentValue = currentValue(ledger, track, Infinity).value;

            const sorted = [...deltas].sort(compareDeltas);
            let folded: TrackValue = track.clamp(track.initial);
            for (const d of sorted) {
              folded = applyOpForTest(folded, d, track);
            }

            expect(viaCurrentValue).toEqual(folded);
          },
        ),
        { numRuns: 50 },
      );
    }
  });
});

function applyOpForTest(
  value: TrackValue,
  d: RelationshipDelta,
  track: ReturnType<typeof resolveTrackSpec>,
): TrackValue {
  switch (d.op) {
    case 'adjust':
      if (track.kind === 'categorical') throw new Error('adjust is not valid for categorical');
      return track.adjust(value, d.by);
    case 'set':
      return track.clamp(d.value);
    case 'add': {
      const current = Array.isArray(value) ? value : [];
      return track.clamp([...current, d.key]);
    }
    case 'remove': {
      const current = Array.isArray(value) ? value : [];
      return track.clamp(current.filter((k) => k !== d.key));
    }
  }
}

describe('ordinal adjust moves rungs and stops at the ends', () => {
  it('moves up and clamps at the top rung', () => {
    expect(attitude.adjust('friendly', 1)).toBe('helpful');
    expect(attitude.adjust('helpful', 5)).toBe('helpful');
  });

  it('moves down and clamps at the bottom rung', () => {
    expect(attitude.adjust('unfriendly', -1)).toBe('hostile');
    expect(attitude.adjust('hostile', -5)).toBe('hostile');
  });
});

describe('multiple-select add/remove are set ops; removing absent is a no-op', () => {
  it('add is idempotent (a set operation)', () => {
    const once = relationshipTags.clamp(['member']) as string[];
    const added = relationshipTags.clamp([...once, 'member']);
    expect(added).toEqual(['member']);
  });

  it('removing an absent option is a no-op', () => {
    const value = relationshipTags.clamp(['member']) as string[];
    const filtered = value.filter((k) => k !== 'hates');
    expect(relationshipTags.clamp(filtered)).toEqual(['member']);
  });
});

describe('resolveTrack: system beats custom with same id; custom found; unknown -> null', () => {
  it('system wins over a colliding custom id', () => {
    const collidingCustom: OrdinalTrackSpec = { ...attitudeSpec, name: 'Fake Attitude' };
    const library: TrackLibrary = { custom: [collidingCustom], optionAdditions: {} };
    const resolved = resolveTrack(attitudeSpec.id, library);
    expect(resolved?.name).toBe('Attitude');
  });

  it('finds a genuinely custom track', () => {
    const custom: OrdinalTrackSpec = { ...attitudeSpec, id: 'cu01', name: 'Custom Track' };
    const library: TrackLibrary = { custom: [custom], optionAdditions: {} };
    expect(resolveTrack('cu01', library)?.name).toBe('Custom Track');
  });

  it('returns null for an unknown id', () => {
    expect(resolveTrack('zzzz')).toBeNull();
  });

  it('listTracks lists system then custom without duplicating collisions', () => {
    const custom: OrdinalTrackSpec = { ...attitudeSpec, id: 'cu01', name: 'Custom Track' };
    const collidingCustom: OrdinalTrackSpec = { ...attitudeSpec, name: 'Fake Attitude' };
    const library: TrackLibrary = { custom: [collidingCustom, custom], optionAdditions: {} };
    const ids = listTracks(library).map((t) => t.id);
    expect(ids).toEqual([...SYSTEM_TRACKS.map((t) => t.id), 'cu01']);
  });
});

describe('option additions append to built-in tags and ignore duplicate keys', () => {
  it('appends new options and drops duplicates', () => {
    const library: TrackLibrary = {
      custom: [],
      optionAdditions: {
        [relationshipTagsSpec.id]: [
          { key: 'rival', label: 'rival', mutual: false },
          { key: 'married', label: 'married (dup)', mutual: true },
        ],
      },
    };
    const track = resolveTrack(relationshipTagsSpec.id, library);
    const optionKeys = track?.kind === 'categorical' ? track.options.map((o) => o.key) : [];
    expect(optionKeys).toContain('rival');
    expect(optionKeys.filter((k) => k === 'married')).toHaveLength(1);
  });
});

describe('compileTrack never throws on a malformed spec', () => {
  it('returns errors instead of throwing for a spec missing required arrays', () => {
    const malformed = {
      kind: 'ordinal',
      id: 'bad1',
      name: 'Bad',
      initial: 'x',
      // `actions` and `rungs` missing entirely.
    } as unknown as OrdinalTrackSpec;
    expect(() => compileTrack(malformed)).not.toThrow();
    const result = compileTrack(malformed);
    expect('errors' in result).toBe(true);
  });
});

describe('no React/IO/Electron imports in src/shared/relationships', () => {
  it('contains no forbidden imports outside __tests__', () => {
    const dir = path.resolve(__dirname, '..');
    const forbidden = /from\s+['"](react|electron|fs|node:.*)['"]/;
    const offenders: string[] = [];

    function walk(current: string) {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__') continue;
          walk(full);
        } else if (entry.name.endsWith('.ts')) {
          const contents = fs.readFileSync(full, 'utf-8');
          if (forbidden.test(contents)) offenders.push(full);
        }
      }
    }

    walk(dir);
    expect(offenders).toEqual([]);
  });
});
