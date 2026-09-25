import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  resolveTrackSpec,
  pf2eReputationSpec,
  attitudeSpec,
  relationshipTagsSpec,
} from '../../index.js';
import {
  parseDirectives,
  roleValue,
  isUnfinished,
  noteIdOf,
  noteRoleValue,
  serialiseDirective,
  serialiseTemplate,
  setRoleValueChange,
  interpretDirective,
  readableParts,
} from '../index.js';
import { requiredRoles } from '../../templates.js';

const pf2eReputation = resolveTrackSpec(pf2eReputationSpec);
const attitude = resolveTrackSpec(attitudeSpec);
const relationshipTags = resolveTrackSpec(relationshipTagsSpec);

function resolveTrack(id: string) {
  if (id === pf2eReputation.id) return pf2eReputation;
  if (id === attitude.id) return attitude;
  if (id === relationshipTags.id) return relationshipTags;
  return null;
}

describe('round-trips every valid form', () => {
  const wordChar = fc
    .string({ minLength: 0, maxLength: 6, unit: fc.constantFrom(...'abcdefgh ,.-—'.split('')) })
    .filter((s) => !s.includes('{') && !s.includes('}') && !s.includes('\n'));

  const idArb = fc.string({
    unit: fc.constantFrom(...'abcdefghij0123456789'.split('')),
    minLength: 4,
    maxLength: 4,
  });

  const roleArb = fc.constantFrom('holder', 'observer', 'amount', 'value', 'option', 'reason');

  const directiveArb = fc
    .record({
      trackId: idArb,
      actionKey: fc.string({
        unit: fc.constantFrom(...'abcdefghij-'.split('')),
        minLength: 1,
        maxLength: 8,
      }),
      roles: fc.uniqueArray(roleArb, { minLength: 0, maxLength: 4 }),
      wording: fc.array(wordChar, { minLength: 1, maxLength: 5 }),
    })
    .map(({ trackId, actionKey, roles, wording }) => {
      let body = '';
      roles.forEach((role, i) => {
        body += wording[i % wording.length];
        body += `{${role}:}`;
      });
      body += wording[wording.length - 1] ?? '';
      return `{{${trackId}.${actionKey} ${body}}}`;
    });

  it('round-trips a single generated directive', () => {
    fc.assert(
      fc.property(directiveArb, (raw) => {
        const { directives, errors } = parseDirectives(raw);
        expect(errors).toEqual([]);
        expect(directives).toHaveLength(1);
        expect(raw.slice(directives[0].from, directives[0].to)).toBe(directives[0].raw);
        expect(serialiseDirective(directives[0])).toBe(raw);
      }),
    );
  });

  it('round-trips several directives with prose around them on one line', () => {
    fc.assert(
      fc.property(
        fc.array(directiveArb, { minLength: 1, maxLength: 3 }),
        wordChar,
        (blocks, sep) => {
          const source = blocks.join(sep.length > 0 ? sep : ' ');
          const { directives, errors } = parseDirectives(source);
          expect(errors).toEqual([]);
          expect(directives).toHaveLength(blocks.length);
          directives.forEach((d, i) => {
            expect(d.ordinal).toBe(i);
            expect(source.slice(d.from, d.to)).toBe(d.raw);
            expect(serialiseDirective(d)).toBe(blocks[i]);
          });
        },
      ),
    );
  });

  it('round-trips a concrete example with wiki links and dashes', () => {
    const raw =
      '{{rp01.change Rep change: {amount:-2} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:attacked their warehouse}}}';
    const { directives, errors } = parseDirectives(raw);
    expect(errors).toEqual([]);
    expect(directives).toHaveLength(1);
    expect(serialiseDirective(directives[0])).toBe(raw);
  });
});

describe('handles the closing `}}}`', () => {
  it('a filled reason immediately followed by the envelope close', () => {
    const raw =
      '{{tg01.gains {holder:[[e5f6]]} is now {option:business-partner} with {observer:[[b7c8]]} — {reason:x}}}';
    const { directives, errors } = parseDirectives(raw);
    expect(errors).toEqual([]);
    expect(directives).toHaveLength(1);
    expect(directives[0].raw).toBe(raw);
    expect(serialiseDirective(directives[0])).toBe(raw);
  });

  it('an empty reason immediately followed by the envelope close', () => {
    const raw =
      '{{rp01.change Rep change: {amount:} {observer:} rep for {holder:[[c3d4]]} — {reason:}}}';
    const { directives, errors } = parseDirectives(raw);
    expect(errors).toEqual([]);
    expect(directives).toHaveLength(1);
    expect(directives[0].raw).toBe(raw);
    expect(serialiseDirective(directives[0])).toBe(raw);
  });
});

describe('parses several directives on one line with ordinals and exact ranges', () => {
  it('assigns ordinals 0,1,2 in document order and exact source ranges', () => {
    const d0 =
      '{{rp01.change Rep change: {amount:1} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:}}}';
    const d1 =
      '{{tg01.gains {holder:[[e5f6]]} is now {option:member} with {observer:[[b7c8]]} — {reason:}}}';
    const d2 =
      '{{at01.shift Attitude shift: {holder:[[c3d4]]} moves {amount:2} with {observer:[[a1b2]]} — {reason:}}}';
    const source = `notes ${d0} then ${d1} and finally ${d2} done`;

    const { directives, errors } = parseDirectives(source);
    expect(errors).toEqual([]);
    expect(directives.map((d) => d.ordinal)).toEqual([0, 1, 2]);
    expect(directives.map((d) => d.raw)).toEqual([d0, d1, d2]);
    directives.forEach((d) => {
      expect(source.slice(d.from, d.to)).toBe(d.raw);
    });
  });
});

describe('ignores directives in fenced and inline code', () => {
  const directive =
    '{{rp01.change Rep change: {amount:1} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:}}}';

  it('ignores a directive inside a ``` fence', () => {
    const source = ['before', '```', directive, '```', 'after ' + directive].join('\n');
    const { directives } = parseDirectives(source);
    expect(directives).toHaveLength(1);
    expect(directives[0].raw).toBe(directive);
  });

  it('ignores a directive inside a ~~~ fence', () => {
    const source = ['~~~', directive, '~~~'].join('\n');
    const { directives } = parseDirectives(source);
    expect(directives).toHaveLength(0);
  });

  it('ignores a directive inside an inline code span', () => {
    const source = `see \`${directive}\` for the example, but really ${directive}`;
    const { directives } = parseDirectives(source);
    expect(directives).toHaveLength(1);
    expect(directives[0].raw).toBe(directive);
  });
});

describe('empty required role → unfinished; empty reason → not unfinished', () => {
  it('flags a missing required role as unfinished', () => {
    const raw =
      '{{rp01.change Rep change: {amount:} {observer:} rep for {holder:[[c3d4]]} — {reason:}}}';
    const { directives } = parseDirectives(raw);
    const d = directives[0];
    const required = requiredRoles('adjust', 'numeric');
    expect(isUnfinished(d, required)).toBe(true);
    const interpreted = interpretDirective(d, { resolveTrack });
    expect(interpreted.status).toBe('unfinished');
    if (interpreted.status === 'unfinished') {
      expect(interpreted.missing).toContain('amount');
      expect(interpreted.missing).toContain('observer');
      expect(interpreted.missing).not.toContain('reason');
    }
  });

  it('an empty reason alone does not make a directive unfinished', () => {
    const raw =
      '{{rp01.change Rep change: {amount:2} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:}}}';
    const { directives } = parseDirectives(raw);
    const d = directives[0];
    expect(isUnfinished(d, requiredRoles('adjust', 'numeric'))).toBe(false);
    expect(interpretDirective(d, { resolveTrack }).status).toBe('ok');
  });
});

describe('malformed blocks produce positioned errors and never throw', () => {
  it('an unterminated directive (no closing braces before EOF)', () => {
    const raw = '{{rp01.change Rep change: {amount:2';
    const { directives, errors } = parseDirectives(raw);
    expect(directives).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].from).toBe(0);
  });

  it('an unterminated directive (newline before closing braces)', () => {
    const raw = '{{rp01.change Rep change: {amount:2}\nmore text}}';
    const { directives, errors } = parseDirectives(raw);
    expect(directives).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it('a bad role token (missing colon)', () => {
    const raw = '{{rp01.change Rep change: {amount2} more}}';
    const { directives, errors } = parseDirectives(raw);
    expect(directives).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it('a duplicate role token', () => {
    const raw =
      '{{rp01.change {amount:1} rep {amount:2} for {holder:[[a1b2]]} {observer:[[c3d4]]} {reason:}}}';
    const { directives, errors } = parseDirectives(raw);
    expect(directives).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/duplicate/i);
  });

  it('an unknown role name', () => {
    const raw = '{{rp01.change Rep change: {bogus:2} more}}';
    const { directives, errors } = parseDirectives(raw);
    expect(directives).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/unknown role/i);
  });

  it('recovers after a malformed block and still finds a later valid one', () => {
    const valid =
      '{{rp01.change Rep change: {amount:1} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:}}}';
    const source = `{{rp01.change bad {oops` + '\n' + valid;
    const { directives, errors } = parseDirectives(source);
    expect(errors).toHaveLength(1);
    expect(directives).toHaveLength(1);
    expect(directives[0].raw).toBe(valid);
  });

  it('`{{ foo }}` prose is not treated as a directive at all', () => {
    const { directives, errors } = parseDirectives('some {{ foo }} prose and {{bar}} too');
    expect(directives).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('fast-check: arbitrary strings never throw', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (s) => {
        expect(() => parseDirectives(s)).not.toThrow();
      }),
    );
  });
});

describe('serialiseTemplate for empty, partly filled and filled roles', () => {
  it('pf2e reputation change: empty', () => {
    const out = serialiseTemplate('rp01', 'change', pf2eReputation.action('change')!.template);
    expect(out).toBe(
      '{{rp01.change Rep change: {amount:} {observer:} rep for {holder:} — {reason:}}}',
    );
    const { directives, errors } = parseDirectives(out);
    expect(errors).toEqual([]);
    expect(directives).toHaveLength(1);
  });

  it('pf2e reputation change: partly filled', () => {
    const out = serialiseTemplate('rp01', 'change', pf2eReputation.action('change')!.template, {
      amount: '-2',
      holder: '[[c3d4]]',
    });
    expect(out).toBe(
      '{{rp01.change Rep change: {amount:-2} {observer:} rep for {holder:[[c3d4]]} — {reason:}}}',
    );
  });

  it('pf2e reputation set: filled', () => {
    const out = serialiseTemplate('rp01', 'set', pf2eReputation.action('set')!.template, {
      holder: '[[c3d4]]',
      observer: '[[a1b2]]',
      value: '5',
      reason: 'audit',
    });
    expect(out).toBe(
      "{{rp01.set Rep set: {holder:[[c3d4]]}'s rep with {observer:[[a1b2]]} is {value:5} — {reason:audit}}}",
    );
  });

  it('attitude shift: filled', () => {
    const out = serialiseTemplate('at01', 'shift', attitude.action('shift')!.template, {
      holder: '[[c3d4]]',
      amount: '1',
      observer: '[[a1b2]]',
      reason: 'helped',
    });
    expect(out).toBe(
      '{{at01.shift Attitude shift: {holder:[[c3d4]]} moves {amount:1} with {observer:[[a1b2]]} — {reason:helped}}}',
    );
  });

  it('attitude set: filled', () => {
    const out = serialiseTemplate('at01', 'set', attitude.action('set')!.template, {
      observer: '[[a1b2]]',
      value: 'friendly',
      holder: '[[c3d4]]',
      reason: '',
    });
    expect(out).toBe(
      '{{at01.set Attitude: {observer:[[a1b2]]} is {value:friendly} toward {holder:[[c3d4]]} — {reason:}}}',
    );
  });

  it('relationship tags gains/loses: filled', () => {
    const gains = serialiseTemplate('tg01', 'gains', relationshipTags.action('gains')!.template, {
      holder: '[[e5f6]]',
      option: 'business-partner',
      observer: '[[b7c8]]',
      reason: 'signed the deal',
    });
    expect(gains).toBe(
      '{{tg01.gains {holder:[[e5f6]]} is now {option:business-partner} with {observer:[[b7c8]]} — {reason:signed the deal}}}',
    );

    const loses = serialiseTemplate('tg01', 'loses', relationshipTags.action('loses')!.template, {
      holder: '[[e5f6]]',
      option: 'business-partner',
      observer: '[[b7c8]]',
    });
    expect(loses).toBe(
      '{{tg01.loses {holder:[[e5f6]]} is no longer {option:business-partner} with {observer:[[b7c8]]} — {reason:}}}',
    );
  });
});

describe('setRoleValueChange rewrites only that token', () => {
  it('applying the change leaves the rest byte-identical', () => {
    const raw =
      '{{rp01.change Rep change: {amount:-2} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:attacked their warehouse}}}';
    const { directives } = parseDirectives(raw);
    const d = directives[0];
    const edit = setRoleValueChange(d, 'amount', '5');
    expect(edit).not.toBeNull();
    const applied = raw.slice(0, edit!.from) + edit!.insert + raw.slice(edit!.to);
    const expected =
      '{{rp01.change Rep change: {amount:5} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:attacked their warehouse}}}';
    expect(applied).toBe(expected);

    const { directives: reparsed, errors } = parseDirectives(applied);
    expect(errors).toEqual([]);
    expect(roleValue(reparsed[0], 'amount')).toBe('5');
    expect(roleValue(reparsed[0], 'observer')).toBe('[[a1b2]]');
    expect(roleValue(reparsed[0], 'holder')).toBe('[[c3d4]]');
    expect(roleValue(reparsed[0], 'reason')).toBe('attacked their warehouse');
  });

  it('returns null for a role not present in the directive', () => {
    const raw =
      '{{rp01.change Rep change: {amount:1} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:}}}';
    const { directives } = parseDirectives(raw);
    expect(setRoleValueChange(directives[0], 'option', 'x')).toBeNull();
  });

  it('strips braces and newlines from the incoming value', () => {
    const raw =
      '{{rp01.change Rep change: {amount:1} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:}}}';
    const { directives } = parseDirectives(raw);
    const edit = setRoleValueChange(directives[0], 'reason', 'a{b}c\nd');
    expect(edit!.insert).toBe('abc d');
  });
});

describe('interpret: unknown track / unknown action messages', () => {
  it('unknown track', () => {
    const raw =
      '{{rp99.change Rep change: {amount:1} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:}}}';
    const { directives } = parseDirectives(raw);
    const result = interpretDirective(directives[0], { resolveTrack });
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.problems[0].message).toBe('Relationship track rp99 not found');
      expect(result.problems[0].code).toBe('unknown-track');
    }
  });

  it('unknown action', () => {
    const raw =
      '{{rp01.boost Rep change: {amount:1} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:}}}';
    const { directives } = parseDirectives(raw);
    const result = interpretDirective(directives[0], { resolveTrack });
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.problems[0].message).toBe('Unknown action "boost" for track PF2E Reputation');
      expect(result.problems[0].code).toBe('unknown-action');
    }
  });
});

describe('interpret: kind decides op for all built-ins', () => {
  it('adjust (numeric)', () => {
    const raw =
      '{{rp01.change Rep change: {amount:-2} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:}}}';
    const { directives } = parseDirectives(raw);
    const result = interpretDirective(directives[0], { resolveTrack });
    expect(result).toMatchObject({ status: 'ok', op: { op: 'adjust', by: -2 } });
  });

  it('adjust (ordinal)', () => {
    const raw =
      '{{at01.shift Attitude shift: {holder:[[c3d4]]} moves {amount:2} with {observer:[[a1b2]]} — {reason:}}}';
    const { directives } = parseDirectives(raw);
    const result = interpretDirective(directives[0], { resolveTrack });
    expect(result).toMatchObject({ status: 'ok', op: { op: 'adjust', by: 2 } });
  });

  it('set (numeric)', () => {
    const raw =
      "{{rp01.set Rep set: {holder:[[c3d4]]}'s rep with {observer:[[a1b2]]} is {value:5} — {reason:}}}";
    const { directives } = parseDirectives(raw);
    const result = interpretDirective(directives[0], { resolveTrack });
    expect(result).toMatchObject({ status: 'ok', op: { op: 'set', value: 5 } });
  });

  it('set (ordinal)', () => {
    const raw =
      '{{at01.set Attitude: {observer:[[a1b2]]} is {value:friendly} toward {holder:[[c3d4]]} — {reason:}}}';
    const { directives } = parseDirectives(raw);
    const result = interpretDirective(directives[0], { resolveTrack });
    expect(result).toMatchObject({ status: 'ok', op: { op: 'set', value: 'friendly' } });
  });

  it('set (categorical)', () => {
    // Relationship tags has no built-in `set` action, so exercise this directly.
    const raw =
      '{{tg01.gains {holder:[[e5f6]]} is now {option:member} with {observer:[[b7c8]]} — {reason:}}}';
    const { directives } = parseDirectives(raw);
    const result = interpretDirective(directives[0], { resolveTrack });
    expect(result).toMatchObject({ status: 'ok', op: { op: 'add', key: 'member' } });
  });

  it('remove (categorical)', () => {
    const raw =
      '{{tg01.loses {holder:[[e5f6]]} is no longer {option:member} with {observer:[[b7c8]]} — {reason:}}}';
    const { directives } = parseDirectives(raw);
    const result = interpretDirective(directives[0], { resolveTrack });
    expect(result).toMatchObject({ status: 'ok', op: { op: 'remove', key: 'member' } });
  });
});

describe('interpret: wrong type, unknown option, unknown rung, zero amount, unknown note', () => {
  it('wrong type amount', () => {
    const raw =
      '{{rp01.change Rep change: {amount:abc} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:}}}';
    const { directives } = parseDirectives(raw);
    const result = interpretDirective(directives[0], { resolveTrack });
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.problems).toEqual([
        { role: 'amount', code: 'wrong-type', message: '"abc" is not a number' },
      ]);
    }
  });

  it('zero amount', () => {
    const raw =
      '{{rp01.change Rep change: {amount:0} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:}}}';
    const { directives } = parseDirectives(raw);
    const result = interpretDirective(directives[0], { resolveTrack });
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.problems[0].code).toBe('zero-amount');
      expect(result.problems[0].role).toBe('amount');
    }
  });

  it('unknown option', () => {
    const raw =
      '{{tg01.gains {holder:[[e5f6]]} is now {option:foo} with {observer:[[b7c8]]} — {reason:}}}';
    const { directives } = parseDirectives(raw);
    const result = interpretDirective(directives[0], { resolveTrack });
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.problems[0].message).toBe('Unknown option "foo" for Relationship tags');
      expect(result.problems[0].code).toBe('unknown-option');
    }
  });

  it('unknown rung', () => {
    const raw =
      '{{at01.set Attitude: {observer:[[a1b2]]} is {value:smitten} toward {holder:[[c3d4]]} — {reason:}}}';
    const { directives } = parseDirectives(raw);
    const result = interpretDirective(directives[0], { resolveTrack });
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.problems[0].code).toBe('unknown-rung');
      expect(result.problems[0].role).toBe('value');
    }
  });

  it('unknown note, via isKnownNote', () => {
    const raw =
      '{{rp01.change Rep change: {amount:1} {observer:[[a1b2]]} rep for {holder:[[zzzz]]} — {reason:}}}';
    const { directives } = parseDirectives(raw);
    const result = interpretDirective(directives[0], {
      resolveTrack,
      isKnownNote: (id) => id !== 'zzzz',
    });
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.problems[0].message).toBe('Unknown note [[zzzz]]');
      expect(result.problems[0].code).toBe('unknown-note');
      expect(result.problems[0].role).toBe('holder');
    }
  });

  it('isKnownNote omitted skips the note-existence check', () => {
    const raw =
      '{{rp01.change Rep change: {amount:1} {observer:[[a1b2]]} rep for {holder:[[zzzz]]} — {reason:}}}';
    const { directives } = parseDirectives(raw);
    const result = interpretDirective(directives[0], { resolveTrack });
    expect(result.status).toBe('ok');
  });
});

describe('readable parts resolve labels, default reason, prompts', () => {
  const labelForNote = (id: string) =>
    id === 'c3d4' ? 'The Warehouse Guild' : id === 'a1b2' ? 'Mira' : id;

  it('resolves note labels and a filled reason', () => {
    const raw =
      '{{rp01.change Rep change: {amount:-2} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:attacked}}}';
    const { directives } = parseDirectives(raw);
    const parts = readableParts(directives[0], {
      track: pf2eReputation,
      labelForNote,
      defaultReason: 'Unspecified',
    });
    const values = parts.filter((p) => p.kind === 'value');
    expect(values.find((p) => p.role === 'observer')).toMatchObject({
      display: 'Mira',
      noteId: 'a1b2',
    });
    expect(values.find((p) => p.role === 'holder')).toMatchObject({
      display: 'The Warehouse Guild',
      noteId: 'c3d4',
    });
    expect(values.find((p) => p.role === 'amount')).toMatchObject({ display: '-2' });
    const reasonPart = values.find((p) => p.role === 'reason');
    expect(reasonPart).toMatchObject({ display: 'attacked' });
    expect(
      reasonPart && 'isDefaultReason' in reasonPart ? reasonPart.isDefaultReason : undefined,
    ).toBeFalsy();
  });

  it('an empty reason falls back to the default reason', () => {
    const raw =
      '{{rp01.change Rep change: {amount:2} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:}}}';
    const { directives } = parseDirectives(raw);
    const parts = readableParts(directives[0], {
      track: pf2eReputation,
      labelForNote,
      defaultReason: 'Session 12',
    });
    const reason = parts.find((p) => p.kind === 'value' && p.role === 'reason');
    expect(reason).toMatchObject({ display: 'Session 12', isDefaultReason: true, empty: false });
  });

  it('an empty non-reason role shows its template prompt', () => {
    const raw =
      '{{rp01.change Rep change: {amount:} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:}}}';
    const { directives } = parseDirectives(raw);
    const parts = readableParts(directives[0], {
      track: pf2eReputation,
      labelForNote,
      defaultReason: 'Unspecified',
    });
    const amount = parts.find((p) => p.kind === 'value' && p.role === 'amount');
    expect(amount).toMatchObject({
      empty: true,
      display: 'Reputation change',
      prompt: 'Reputation change',
    });
  });

  it('an empty role with no template prompt gets the "choose <role>" default', () => {
    const raw =
      '{{at01.shift Attitude shift: {holder:[[c3d4]]} moves {amount:1} with {observer:} — {reason:}}}';
    const { directives } = parseDirectives(raw);
    const parts = readableParts(directives[0], {
      track: attitude,
      labelForNote,
      defaultReason: 'Unspecified',
    });
    const observer = parts.find((p) => p.kind === 'value' && p.role === 'observer');
    expect(observer).toMatchObject({ empty: true, display: 'choose observer' });
  });

  it('returns [] when the track or action is unknown', () => {
    const raw =
      '{{rp01.boost Rep change: {amount:1} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:}}}';
    const { directives } = parseDirectives(raw);
    expect(
      readableParts(directives[0], { track: pf2eReputation, labelForNote, defaultReason: 'x' }),
    ).toEqual([]);
    expect(readableParts(directives[0], { track: null, labelForNote, defaultReason: 'x' })).toEqual(
      [],
    );
  });
});

describe('note values are read via extractWikiLinkIds', () => {
  it('a bare wiki link resolves to its id', () => {
    expect(noteIdOf('[[a1b2]]')).toBe('a1b2');
  });

  it('a labelled wiki link resolves to its id', () => {
    expect(noteIdOf('[[Label|a1b2]]')).toBe('a1b2');
  });

  it('an empty or non-link value resolves to null', () => {
    expect(noteIdOf('')).toBeNull();
    expect(noteIdOf('not a link')).toBeNull();
  });

  it('noteRoleValue formats the canonical bare wiki link', () => {
    expect(noteRoleValue('a1b2')).toBe('[[a1b2]]');
  });
});
