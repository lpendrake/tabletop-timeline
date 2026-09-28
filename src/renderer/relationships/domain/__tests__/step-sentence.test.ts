import { describe, it, expect } from 'vitest';
import {
  parseDirectives,
  resolveTrackSpec,
  pf2eReputationSpec,
  type Ledger,
} from '../../../../shared/relationships';
import { buildStepRows } from '../step-rows';
import { buildStepSentence, isEventPath } from '../step-sentence';

const rp01 = resolveTrackSpec(pf2eReputationSpec);
const labelFor = (id: string) => (id === 'aaaa' ? 'Zara' : id === 'bbbb' ? 'Anna' : id);

const source =
  '{{rp01.change {amount:5} {observer:[[bbbb]]} rep for {holder:[[aaaa]]} — {reason:}}}';

function ledger(overrides: Partial<Ledger> = {}): Ledger {
  return {
    holder: 'aaaa',
    observer: 'bbbb',
    track: rp01.id,
    deltas: [{ op: 'adjust', by: 5, at: 10, declaredIn: { path: 'timeline/e.md', ordinal: 0 } }],
    ...overrides,
  };
}

describe('isEventPath', () => {
  it('is true for timeline/ paths and false otherwise', () => {
    expect(isEventPath('timeline/e.md')).toBe(true);
    expect(isEventPath('notes/n.md')).toBe(false);
  });
});

describe('buildStepSentence', () => {
  it('returns null when the file has not been fetched yet', () => {
    const l = ledger();
    const [step] = buildStepRows(
      [{ delta: l.deltas[0], runningValue: 5, applied: true, reset: false }],
      rp01,
    );
    expect(buildStepSentence(l, step, rp01, undefined, labelFor)).toBeNull();
  });

  it('renders the directive as readable parts, defaulting an empty reason to the event title', () => {
    const l = ledger();
    const directives = parseDirectives(source).directives;
    const [step] = buildStepRows(
      [{ delta: l.deltas[0], runningValue: 5, applied: true, reset: false }],
      rp01,
    );

    const sentence = buildStepSentence(
      l,
      step,
      rp01,
      { title: 'Big Meeting', directives },
      labelFor,
    );

    expect(sentence).not.toBeNull();
    const text = sentence!.parts.map((p) => p.display ?? (p as { text: string }).text).join('');
    expect(text).toContain('Zara');
    expect(text).toContain('Anna');
    expect(text).toContain('Big Meeting'); // empty {reason:} falls back to the event title
    expect(sentence!.mirroredFromLabel).toBeNull();
  });

  it('labels a mirrored step with the ledger observer (the side it mirrors)', () => {
    const l = ledger({
      deltas: [
        {
          op: 'adjust',
          by: 5,
          at: 10,
          declaredIn: { path: 'timeline/e.md', ordinal: 0 },
          mirrored: true,
        },
      ],
    });
    const directives = parseDirectives(source).directives;
    const [step] = buildStepRows(
      [{ delta: l.deltas[0], runningValue: 5, applied: true, reset: false }],
      rp01,
    );

    const sentence = buildStepSentence(
      l,
      step,
      rp01,
      { title: 'Big Meeting', directives },
      labelFor,
    );

    expect(sentence!.mirroredFromLabel).toBe('Anna'); // ledger.observer
  });
});
