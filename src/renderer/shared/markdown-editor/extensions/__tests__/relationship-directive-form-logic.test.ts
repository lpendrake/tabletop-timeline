import { describe, it, expect } from 'vitest';
import {
  allowsCreateOption,
  buildInitialDraft,
  buildNotePickerRecents,
  changedRoles,
  fieldKindFor,
  filterHeldOptions,
  firstEmptyRole,
  formRoles,
  prefillNoteValue,
  rankNoteOptions,
  shouldNotifyHolderChosen,
  shouldOfferCreateOption,
  stepAmount,
  stepNumericValue,
  storedValueFor,
  validateFormField,
} from '../relationship-directive-form-logic';
import {
  parseDirectives,
  serialiseTemplate,
} from '../../../../../shared/relationships/directives/index';
import {
  pf2eReputationSpec,
  relationshipTagsSpec,
} from '../../../../../shared/relationships/system/index';
import { resolveTrackSpec } from '../../../../../shared/relationships/resolve';

const CHANGE_TEMPLATE = pf2eReputationSpec.actions.find((a) => a.key === 'change')!.template;
const LOSES_TEMPLATE = relationshipTagsSpec.actions.find((a) => a.key === 'loses')!.template;

const REP_TRACK = resolveTrackSpec(pf2eReputationSpec);
const TAG_TRACK = resolveTrackSpec(relationshipTagsSpec);

function directiveFor(text: string) {
  const d = parseDirectives(text).directives[0];
  if (!d) throw new Error('expected a parsed directive');
  return d;
}

describe('formRoles / firstEmptyRole (pure)', () => {
  it('lists roles in template (document) order', () => {
    const d = directiveFor(
      serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
        amount: '-2',
        observer: '[[a1b2]]',
        holder: '[[c3d4]]',
        reason: 'x',
      }),
    );
    expect(formRoles(d)).toEqual(['amount', 'observer', 'holder', 'reason']);
  });

  it('focuses the first empty blank, falling back to the first blank', () => {
    const unfinished = directiveFor(
      serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
        observer: '[[a1b2]]',
        holder: '[[c3d4]]',
        reason: 'x',
      }),
    );
    expect(firstEmptyRole(unfinished)).toBe('amount');

    const full = directiveFor(
      serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
        amount: '-2',
        observer: '[[a1b2]]',
        holder: '[[c3d4]]',
        reason: 'x',
      }),
    );
    expect(firstEmptyRole(full)).toBe('amount');
  });
});

describe('buildInitialDraft (pure)', () => {
  it('snapshots every token value by role, un-wrapping a note role to its bare id', () => {
    const d = directiveFor(
      serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
        amount: '-2',
        observer: '[[a1b2]]',
        holder: '',
        reason: 'x',
      }),
    );
    expect(buildInitialDraft(d)).toEqual({
      amount: '-2',
      observer: 'a1b2',
      holder: '',
      reason: 'x',
    });
  });
});

describe('fieldKindFor (pure)', () => {
  it('classifies roles against the resolved track', () => {
    expect(fieldKindFor('amount', REP_TRACK)).toBe('amount');
    expect(fieldKindFor('holder', REP_TRACK)).toBe('note');
    expect(fieldKindFor('observer', REP_TRACK)).toBe('note');
    expect(fieldKindFor('reason', REP_TRACK)).toBe('reason');
    expect(fieldKindFor('option', TAG_TRACK)).toBe('categorical-option');
    expect(fieldKindFor('value', null)).toBe('unsupported');
  });
});

describe('validateFormField (pure)', () => {
  it('leaves an empty amount/value field valid — a directive may stay unfinished', () => {
    expect(validateFormField('amount', REP_TRACK, '')).toEqual({ ok: true, value: '' });
    expect(validateFormField('numeric-value', REP_TRACK, '  ')).toEqual({ ok: true, value: '' });
  });

  it('rejects a zero amount and normalises a valid one', () => {
    expect(validateFormField('amount', REP_TRACK, '0')).toMatchObject({
      ok: false,
      message: 'Amount cannot be zero',
    });
    expect(validateFormField('amount', REP_TRACK, '+3')).toEqual({ ok: true, value: '3' });
  });

  it('every other kind is always valid — a picked id/key or free text', () => {
    expect(validateFormField('note', REP_TRACK, 'anything')).toEqual({
      ok: true,
      value: 'anything',
    });
    expect(validateFormField('reason', REP_TRACK, 'anything')).toEqual({
      ok: true,
      value: 'anything',
    });
    expect(validateFormField('categorical-option', TAG_TRACK, 'anything')).toEqual({
      ok: true,
      value: 'anything',
    });
  });
});

describe('storedValueFor (pure)', () => {
  it('wraps a note id as [[id]], sanitises reason, leaves everything else as-is', () => {
    expect(storedValueFor('note', 'c3d4')).toBe('[[c3d4]]');
    expect(storedValueFor('note', '')).toBe('');
    expect(storedValueFor('reason', 'a {b} c\nd')).toBe('a b c d');
    expect(storedValueFor('amount', '-2')).toBe('-2');
    expect(storedValueFor('categorical-option', 'member')).toBe('member');
  });
});

describe('changedRoles (pure)', () => {
  it('only reports roles whose stored value differs from the directive', () => {
    const d = directiveFor(
      serialiseTemplate('rp01', 'change', CHANGE_TEMPLATE, {
        amount: '-2',
        observer: '[[a1b2]]',
        holder: '[[c3d4]]',
        reason: 'attacked',
      }),
    );
    expect(changedRoles(d, { amount: '-2', reason: 'attacked' })).toEqual([]);
    expect(changedRoles(d, { amount: '-5', reason: 'attacked' })).toEqual(['amount']);
    expect(
      changedRoles(d, { amount: '-2', observer: '[[e5f6]]', holder: '[[c3d4]]', reason: 'raided' }),
    ).toEqual(['observer', 'reason']);
  });
});

describe('step helpers (pure)', () => {
  it('steps amount unbounded by the track step', () => {
    expect(stepAmount('1', REP_TRACK, 1)).toBe('2');
    expect(stepAmount('1', REP_TRACK, -1)).toBe('0');
  });

  it('clamps a numeric value step to the track range', () => {
    expect(stepNumericValue('49', REP_TRACK, 1)).toBe('50');
    expect(stepNumericValue('50', REP_TRACK, 1)).toBe('50'); // clamped at max
    expect(stepNumericValue('-50', REP_TRACK, -1)).toBe('-50'); // clamped at min
  });
});

describe('Create-row rules (pure)', () => {
  it('only an Add action offers Create', () => {
    expect(allowsCreateOption('add')).toBe(true);
    expect(allowsCreateOption('remove')).toBe(false);
    expect(allowsCreateOption('adjust')).toBe(false);
    expect(allowsCreateOption(undefined)).toBe(false);
  });

  it('offers Create only for an unmatched query', () => {
    const options = [{ id: 'member', path: 'Member', label: 'Member' }];
    expect(shouldOfferCreateOption('', options)).toBe(false);
    expect(shouldOfferCreateOption('member', options)).toBe(false);
    expect(shouldOfferCreateOption('Boss', options)).toBe(true);
  });
});

describe('filterHeldOptions (pure)', () => {
  const options = [
    { id: 'member', path: 'Member', label: 'Member' },
    { id: 'boss', path: 'Boss', label: 'Boss' },
  ];

  it('passes everything through when unfiltered (null)', () => {
    expect(filterHeldOptions(options, null)).toEqual(options);
  });

  it('restricts to the held keys', () => {
    expect(filterHeldOptions(options, ['boss'])).toEqual([options[1]]);
    expect(filterHeldOptions(options, [])).toEqual([]);
  });
});

describe('note picker helpers (pure)', () => {
  it('shouldNotifyHolderChosen only fires for an empty holder with no default set', () => {
    expect(shouldNotifyHolderChosen('holder', null)).toBe(true);
    expect(shouldNotifyHolderChosen('holder', 'c3d4')).toBe(false);
    expect(shouldNotifyHolderChosen('observer', null)).toBe(false);
  });

  it('buildNotePickerRecents pins the current note to the front once', () => {
    expect(buildNotePickerRecents(['a', 'b'], 'c')).toEqual(['c', 'a', 'b']);
    expect(buildNotePickerRecents(['a', 'b'], 'a')).toEqual(['a', 'b']);
    expect(buildNotePickerRecents(['a', 'b'], null)).toEqual(['a', 'b']);
  });

  it('prefillNoteValue extracts a bare id and defaults an empty holder', () => {
    expect(prefillNoteValue('holder', '[[c3d4]]', null)).toBe('c3d4');
    expect(prefillNoteValue('holder', '', 'default-id')).toBe('default-id');
    expect(prefillNoteValue('observer', '', 'default-id')).toBeUndefined();
  });

  it('rankNoteOptions ranks by title/id match, recents-first when the query is empty', () => {
    const options = [
      { id: 'a1b2', path: 'a1b2', label: 'White Tigers' },
      { id: 'c3d4', path: 'c3d4', label: 'The Party' },
    ];
    expect(rankNoteOptions(options, '', ['c3d4'])[0].id).toBe('c3d4');
    expect(rankNoteOptions(options, 'tiger')[0].id).toBe('a1b2');
  });
});

describe('LOSES template shares the same role ordering machinery', () => {
  it('parses a Remove directive with holder/option/observer/reason roles', () => {
    const d = directiveFor(
      serialiseTemplate('tg01', 'loses', LOSES_TEMPLATE, {
        holder: '[[c3d4]]',
        option: 'member',
        observer: '[[a1b2]]',
        reason: 'left',
      }),
    );
    expect(formRoles(d)).toContain('option');
    expect(formRoles(d)).toContain('observer');
  });
});
