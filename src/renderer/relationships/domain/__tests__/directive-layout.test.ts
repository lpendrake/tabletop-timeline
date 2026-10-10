import { describe, it, expect } from 'vitest';
import { parseDirectives, resolveTrackSpec } from '../../../../shared/relationships';
import {
  pf2eReputationSpec,
  relationshipTagsSpec,
  attitudeSpec,
} from '../../../../shared/relationships/system/index';
import {
  adjacentSlot,
  classifyChange,
  directiveLayout,
  firstEditSlot,
  nearestSlot,
  roleHasChoices,
  valueDisplay,
} from '../directive-layout';

//            0         1         2         3         4
//            0123456789012345678901234567890123456789012345678
const SRC = '{{rp01.change Rep: {amount:-2} for {holder:} — {reason:x}}}';
const d = parseDirectives(SRC).directives[0];

const at = (needle: string) => SRC.indexOf(needle);
const amount = { from: at('-2'), to: at('-2') + 2 };
const holder = at('{holder:') + '{holder:'.length;
const reason = { from: at('{reason:') + '{reason:'.length, to: at('x}') + 1 };

describe('directiveLayout', () => {
  it('splits a directive into envelope, wording, delimiters, values and structure', () => {
    const layout = directiveLayout(d);
    expect(SRC.slice(layout.envelope.from, layout.envelope.to)).toBe('{{rp01.change ');
    expect(SRC.slice(layout.close.from, layout.close.to)).toBe('}}');
    expect(layout.wording.map((w) => SRC.slice(w.from, w.to))).toEqual(['Rep: ', ' for ', ' — ']);
    expect(layout.delimiters.map((w) => SRC.slice(w.from, w.to))).toEqual([
      '{amount:',
      '}',
      '{holder:',
      '}',
      '{reason:',
      '}',
    ]);
    expect(layout.slots.map((s) => [s.role, s.from, s.to])).toEqual([
      ['amount', amount.from, amount.to],
      ['holder', holder, holder],
      ['reason', reason.from, reason.to],
    ]);
    // Structure is everything between values, so values and structure tile the directive.
    expect(layout.structure).toEqual([
      { from: 0, to: amount.from },
      { from: amount.to, to: holder },
      { from: holder, to: reason.from },
      { from: reason.to, to: SRC.length },
    ]);
  });
});

describe('slot navigation', () => {
  it('finds neighbours from inside a slot or from structure', () => {
    expect(adjacentSlot(d, amount.to, 1)?.role).toBe('holder');
    expect(adjacentSlot(d, holder, 1)?.role).toBe('reason');
    expect(adjacentSlot(d, reason.from, 1)).toBeNull();
    expect(adjacentSlot(d, holder, -1)?.role).toBe('amount');
    expect(adjacentSlot(d, 3, 1)?.role).toBe('amount');
  });

  it('firstEditSlot prefers the first empty blank', () => {
    expect(firstEditSlot(d)?.role).toBe('holder');
  });

  it('nearestSlot picks the closest blank to a position', () => {
    expect(nearestSlot(d, 2)?.role).toBe('amount');
    expect(nearestSlot(d, holder + 2)?.role).toBe('holder');
    expect(nearestSlot(d, SRC.length)?.role).toBe('reason');
  });
});

describe('classifyChange', () => {
  const ds = [d];
  it('allows edits inside a value, including an empty value point', () => {
    expect(classifyChange(ds, amount.from, amount.to).kind).toBe('value');
    expect(classifyChange(ds, holder, holder).kind).toBe('value');
    expect(classifyChange(ds, reason.to, reason.to).kind).toBe('value');
  });

  it('blocks edits in structure or straddling a value edge', () => {
    expect(classifyChange(ds, 3, 3).kind).toBe('blocked');
    expect(classifyChange(ds, amount.from - 1, amount.to).kind).toBe('blocked');
    expect(classifyChange(ds, amount.from, holder).kind).toBe('blocked');
  });

  it('treats text right outside, and whole replacement, as fine', () => {
    const outside = parseDirectives(`a ${SRC} b`).directives;
    expect(classifyChange(outside, 2, 2).kind).toBe('free');
    expect(classifyChange(outside, 2 + SRC.length, 2 + SRC.length).kind).toBe('free');
    expect(classifyChange(outside, 0, SRC.length + 4).kind).toBe('whole');
    expect(classifyChange(outside, 2, 2 + SRC.length).kind).toBe('whole');
  });
});

describe('valueDisplay', () => {
  const rep = resolveTrackSpec(pf2eReputationSpec);
  const tags = resolveTrackSpec(relationshipTagsSpec);
  const attitude = resolveTrackSpec(attitudeSpec);
  const labelFor = (id: string) => (id === 'a1b2' ? 'The Vanguard' : '?');

  it('shows exact note links, known tags and rungs as labels', () => {
    expect(valueDisplay('holder', '[[a1b2]]', rep, labelFor)).toEqual({
      kind: 'label',
      label: 'The Vanguard',
      noteId: 'a1b2',
    });
    expect(valueDisplay('option', 'married', tags, labelFor)).toEqual({
      kind: 'label',
      label: 'married',
    });
    const rung = attitude.kind === 'ordinal' ? attitude.rungs[0] : null;
    expect(valueDisplay('value', rung!.key, attitude, labelFor)).toEqual({
      kind: 'label',
      label: rung!.label,
    });
  });

  it('shows typed text, unknown keys and free-text roles as text', () => {
    expect(valueDisplay('holder', 'spi', rep, labelFor).kind).toBe('text');
    expect(valueDisplay('holder', '[[a1b2]] extra', rep, labelFor).kind).toBe('text');
    expect(valueDisplay('option', 'boss', tags, labelFor).kind).toBe('text');
    expect(valueDisplay('amount', '-2', rep, labelFor).kind).toBe('text');
    expect(valueDisplay('reason', '', rep, labelFor).kind).toBe('empty');
  });

  it('knows which roles offer a list', () => {
    expect(roleHasChoices('holder', rep)).toBe(true);
    expect(roleHasChoices('option', tags)).toBe(true);
    expect(roleHasChoices('value', attitude)).toBe(true);
    expect(roleHasChoices('value', rep)).toBe(false);
    expect(roleHasChoices('amount', rep)).toBe(false);
    expect(roleHasChoices('reason', rep)).toBe(false);
  });
});
