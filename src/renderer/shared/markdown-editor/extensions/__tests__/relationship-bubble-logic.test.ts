import { describe, it, expect } from 'vitest';
import {
  blankRoles,
  firstBlankRole,
  nextBlankRole,
  previousBlankRole,
  validateAmount,
  validateNumericValue,
  stepAmount,
  stepNumericValue,
  stepRung,
  decideBubbleKey,
  shouldOfferCreateOption,
  filterHeldOptions,
  sanitiseFreeText,
  computeTailOffset,
  TAIL_EDGE_INSET,
} from '../relationship-bubble-logic';
import { parseDirectives, resolveTrackSpec } from '../../../../../shared/relationships';
import { pf2eReputationSpec, attitudeSpec } from '../../../../../shared/relationships/system/index';

function directiveFor(text: string) {
  return parseDirectives(text).directives[0];
}

describe('blank ordering (pure)', () => {
  it('lists roles in token order and finds first/next/previous', () => {
    const d = directiveFor(
      '{{rp01.change Rep change: {amount:-2} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:x}}}',
    );
    expect(blankRoles(d)).toEqual(['amount', 'observer', 'holder', 'reason']);
    expect(nextBlankRole(blankRoles(d), 'amount')).toBe('observer');
    expect(nextBlankRole(blankRoles(d), 'reason')).toBeNull();
    expect(previousBlankRole(blankRoles(d), 'holder')).toBe('observer');
    expect(previousBlankRole(blankRoles(d), 'amount')).toBeNull();
  });

  it('firstBlankRole picks the first empty token, else the first token', () => {
    const empty = directiveFor(
      '{{rp01.change Rep change: {amount:} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:x}}}',
    );
    expect(firstBlankRole(empty)).toBe('amount');

    const full = directiveFor(
      '{{rp01.change Rep change: {amount:-2} {observer:[[a1b2]]} rep for {holder:[[c3d4]]} — {reason:x}}}',
    );
    expect(firstBlankRole(full)).toBe('amount');
  });
});

describe('validation (pure)', () => {
  it('rejects a zero amount and non-numbers', () => {
    expect(validateAmount('0')).toEqual({ ok: false, message: 'Amount cannot be zero' });
    expect(validateAmount('abc')).toEqual({ ok: false, message: 'Amount must be a number' });
    expect(validateAmount('-3')).toEqual({ ok: true, value: '-3' });
  });

  it('rejects an out-of-range numeric value', () => {
    const track = resolveTrackSpec(pf2eReputationSpec);
    expect(validateNumericValue('999', track)).toEqual({
      ok: false,
      message: 'Value is out of range',
    });
    expect(validateNumericValue('x', track)).toEqual({
      ok: false,
      message: 'Value must be a number',
    });
    expect(validateNumericValue('10', track)).toEqual({ ok: true, value: '10' });
  });
});

describe('stepping (pure)', () => {
  it('steps amount by the track step, unclamped', () => {
    const track = resolveTrackSpec(pf2eReputationSpec);
    expect(stepAmount('2', track, 1)).toBe('3');
    expect(stepAmount('2', track, -1)).toBe('1');
  });

  it('steps a numeric value by the track step, clamped to [min, max]', () => {
    const track = resolveTrackSpec(pf2eReputationSpec);
    expect(stepNumericValue('50', track, 1)).toBe('50');
    expect(stepNumericValue('-50', track, -1)).toBe('-50');
    expect(stepNumericValue('10', track, 1)).toBe('11');
  });

  it('moves an ordinal value one rung at a time, clamped to the rung list', () => {
    const track = resolveTrackSpec(attitudeSpec);
    expect(stepRung('indifferent', track, 1)).toBe('friendly');
    expect(stepRung('helpful', track, 1)).toBe('helpful');
    expect(stepRung('hostile', track, -1)).toBe('hostile');
  });
});

describe('decideBubbleKey (pure)', () => {
  it('Enter/Tab advance, Shift+Tab goes back, Escape closes', () => {
    const mid = { shiftKey: false, atStart: false, atEnd: false };
    expect(decideBubbleKey('Enter', mid)).toEqual({ type: 'advance' });
    expect(decideBubbleKey('Tab', mid)).toEqual({ type: 'advance' });
    expect(decideBubbleKey('Tab', { ...mid, shiftKey: true })).toEqual({ type: 'back' });
    expect(decideBubbleKey('Escape', mid)).toEqual({ type: 'close' });
  });

  it('Left at the start hops back, Right at the end hops forward; otherwise no-op', () => {
    expect(decideBubbleKey('ArrowLeft', { shiftKey: false, atStart: true, atEnd: false })).toEqual({
      type: 'hop-prev',
    });
    expect(decideBubbleKey('ArrowRight', { shiftKey: false, atStart: false, atEnd: true })).toEqual(
      {
        type: 'hop-next',
      },
    );
    expect(decideBubbleKey('ArrowLeft', { shiftKey: false, atStart: false, atEnd: false })).toEqual(
      { type: 'none' },
    );
    expect(
      decideBubbleKey('ArrowRight', { shiftKey: false, atStart: false, atEnd: false }),
    ).toEqual({ type: 'none' });
  });

  it('Up/Down report a step direction; nothing else does', () => {
    const mid = { shiftKey: false, atStart: false, atEnd: false };
    expect(decideBubbleKey('ArrowUp', mid)).toEqual({ type: 'step', dir: 1 });
    expect(decideBubbleKey('ArrowDown', mid)).toEqual({ type: 'step', dir: -1 });
    expect(decideBubbleKey('a', mid)).toEqual({ type: 'none' });
  });
});

describe('option create-row + held-options filtering (pure)', () => {
  it('offers a Create row only for an unmatched, non-empty query', () => {
    const matches = [{ id: 'member', path: 'member', label: 'member' }];
    expect(shouldOfferCreateOption('', matches)).toBe(false);
    expect(shouldOfferCreateOption('member', matches)).toBe(false);
    expect(shouldOfferCreateOption('Member', matches)).toBe(false);
    expect(shouldOfferCreateOption('rival', matches)).toBe(true);
  });

  it('filters options down to only held keys when given; passes through when null', () => {
    const options = [
      { id: 'member', path: 'member' },
      { id: 'hates', path: 'hates' },
    ];
    expect(filterHeldOptions(options, ['hates'])).toEqual([{ id: 'hates', path: 'hates' }]);
    expect(filterHeldOptions(options, null)).toEqual(options);
    expect(filterHeldOptions(options, [])).toEqual([]);
  });
});

describe('sanitiseFreeText (pure)', () => {
  it('strips braces and collapses line breaks', () => {
    expect(sanitiseFreeText('a {b} c\nd')).toBe('a b c d');
  });
});

describe('computeTailOffset (pure)', () => {
  it('points straight at the blank centre when it falls inside the bubble', () => {
    // Bubble spans [100, 340) (width 240); blank centre at 150 → 50px in.
    expect(computeTailOffset(150, 100, 240)).toBe(50);
  });

  it('clamps to the inset from the left edge when the blank sits left of the bubble', () => {
    expect(computeTailOffset(90, 100, 240)).toBe(TAIL_EDGE_INSET);
  });

  it('clamps to the inset from the right edge when the blank sits right of the bubble', () => {
    expect(computeTailOffset(500, 100, 240)).toBe(240 - TAIL_EDGE_INSET);
  });

  it('falls back to the inset itself when the bubble is narrower than twice the inset', () => {
    // Too narrow to keep both edge insets apart — pins to the (single) inset
    // rather than producing a negative or out-of-order clamp range.
    expect(computeTailOffset(0, 0, 10)).toBe(TAIL_EDGE_INSET);
    expect(computeTailOffset(1000, 0, 10)).toBe(TAIL_EDGE_INSET);
  });
});
