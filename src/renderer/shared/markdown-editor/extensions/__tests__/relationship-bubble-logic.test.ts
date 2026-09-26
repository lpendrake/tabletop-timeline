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
  computeTailOffset,
  TAIL_EDGE_INSET,
  shouldNotifyHolderChosen,
  buildNotePickerRecents,
  prefillNoteValue,
  pickForTab,
  initialNumberFieldValue,
  allowsFraction,
  isAllowedNumberInputText,
  bubbleVerticalAnchors,
  planBubbleFit,
  clampBubbleLeft,
  MIN_VISIBLE_LIST_ROWS,
} from '../relationship-bubble-logic';
import {
  parseDirectives,
  resolveTrackSpec,
  sanitiseValue,
} from '../../../../../shared/relationships';
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
  const track = resolveTrackSpec(pf2eReputationSpec);

  it('rejects a zero amount and non-numbers', () => {
    expect(validateAmount('0', track)).toEqual({ ok: false, message: 'Amount cannot be zero' });
    expect(validateAmount('abc', track)).toEqual({ ok: false, message: '"abc" is not a number' });
    expect(validateAmount('-3', track)).toEqual({ ok: true, value: '-3' });
  });

  it('rejects a fractional amount on an integer-step track', () => {
    expect(validateAmount('1.5', track)).toEqual({
      ok: false,
      message: '1.5 must be a whole number',
    });
  });

  it('rejects an out-of-range numeric value', () => {
    expect(validateNumericValue('999', track)).toEqual({
      ok: false,
      message: '999 is out of range for PF2E Reputation',
    });
    expect(validateNumericValue('x', track)).toEqual({
      ok: false,
      message: '"x" is not a number',
    });
    expect(validateNumericValue('10', track)).toEqual({ ok: true, value: '10' });
  });

  it('rejects malformed decimal syntax (exponents, hex)', () => {
    expect(validateAmount('1e3', track)).toEqual({ ok: false, message: '"1e3" is not a number' });
    expect(validateAmount('0x10', track)).toEqual({ ok: false, message: '"0x10" is not a number' });
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

describe('shouldNotifyHolderChosen (pure)', () => {
  it('only notifies for the holder role, and only when no default holder is set', () => {
    expect(shouldNotifyHolderChosen('holder', null)).toBe(true);
    expect(shouldNotifyHolderChosen('holder', 'c3d4')).toBe(false);
    expect(shouldNotifyHolderChosen('observer', null)).toBe(false);
  });
});

describe('buildNotePickerRecents (pure)', () => {
  it('pins the current note to the front when not already present', () => {
    expect(buildNotePickerRecents(['a1', 'b2'], 'c3')).toEqual(['c3', 'a1', 'b2']);
  });

  it('leaves recents untouched when the current note is already there', () => {
    expect(buildNotePickerRecents(['a1', 'b2'], 'a1')).toEqual(['a1', 'b2']);
  });

  it('leaves recents untouched when there is no current note', () => {
    expect(buildNotePickerRecents(['a1', 'b2'], null)).toEqual(['a1', 'b2']);
  });
});

describe('prefillNoteValue (pure)', () => {
  it('extracts a bare id from a [[id]] value', () => {
    expect(prefillNoteValue('observer', '[[a1b2]]', null)).toBe('a1b2');
  });

  it('falls back to the default holder only for an empty holder blank', () => {
    expect(prefillNoteValue('holder', '', 'c3d4')).toBe('c3d4');
    expect(prefillNoteValue('observer', '', 'c3d4')).toBeUndefined();
  });

  it('an already-filled holder keeps its own value over the default', () => {
    expect(prefillNoteValue('holder', '[[a1b2]]', 'c3d4')).toBe('a1b2');
  });
});

describe('pickForTab (pure)', () => {
  const options = [
    { id: 'a1', path: 'npcs/mira', label: 'Mira' },
    { id: 'c3', path: 'factions/party', label: 'The Party' },
  ];

  it('picks the top ranked match for a non-empty query', () => {
    expect(pickForTab(options, 'mira', undefined, null)?.id).toBe('a1');
  });

  it('an empty query keeps the current value when it still ranks', () => {
    expect(pickForTab(options, '', undefined, 'c3')?.id).toBe('c3');
  });

  it('falls back to the top result when the current value no longer ranks', () => {
    expect(pickForTab(options, '', undefined, 'zzz')?.id).toBe('a1');
  });

  it('returns null when there are no options at all', () => {
    expect(pickForTab([], '', undefined, null)).toBeNull();
  });
});

describe('sanitiseValue (pure, shared)', () => {
  it('strips braces and collapses line breaks', () => {
    expect(sanitiseValue('a {b} c\nd')).toBe('a b c d');
  });
});

describe('initialNumberFieldValue (pure)', () => {
  const track = resolveTrackSpec(pf2eReputationSpec); // numeric, range [-50, 50]

  it('keeps a non-empty value untouched', () => {
    expect(initialNumberFieldValue('amount', '-2', track)).toBe('-2');
    expect(initialNumberFieldValue('value', '10', track)).toBe('10');
  });

  it("amount starts at plain '1' when empty — it's unbounded", () => {
    expect(initialNumberFieldValue('amount', '', track)).toBe('1');
    expect(initialNumberFieldValue('amount', '', null)).toBe('1');
  });

  it('a numeric value starts at 1 when empty and 1 is in range', () => {
    expect(initialNumberFieldValue('value', '', track)).toBe('1');
  });

  it("a numeric value starts at the track's clamp(1) when 1 is out of range", () => {
    const narrow = resolveTrackSpec({ ...pf2eReputationSpec, min: 5, max: 20, bands: [] });
    expect(initialNumberFieldValue('value', '', narrow)).toBe('5');
  });
});

describe('allowsFraction / isAllowedNumberInputText (pure)', () => {
  const integerTrack = resolveTrackSpec(pf2eReputationSpec); // integer step
  const fractionalTrack = resolveTrackSpec({ ...pf2eReputationSpec, step: 0.5 });

  it('an integer-step track does not allow a decimal point', () => {
    expect(allowsFraction(integerTrack)).toBe(false);
    expect(isAllowedNumberInputText('2.5', integerTrack)).toBe(false);
    expect(isAllowedNumberInputText('-2', integerTrack)).toBe(true);
    expect(isAllowedNumberInputText('2a', integerTrack)).toBe(false);
  });

  it('a fractional-step track allows one decimal point', () => {
    expect(allowsFraction(fractionalTrack)).toBe(true);
    expect(isAllowedNumberInputText('2.5', fractionalTrack)).toBe(true);
    expect(isAllowedNumberInputText('2.5.1', fractionalTrack)).toBe(false);
  });

  it('a lone sign or empty string is allowed (still being typed)', () => {
    expect(isAllowedNumberInputText('', integerTrack)).toBe(true);
    expect(isAllowedNumberInputText('-', integerTrack)).toBe(true);
    expect(isAllowedNumberInputText('+', integerTrack)).toBe(true);
  });

  it('a null track (unknown) falls back to integer-only', () => {
    expect(isAllowedNumberInputText('2.5', null)).toBe(false);
    expect(isAllowedNumberInputText('25', null)).toBe(true);
  });
});

describe('bubble fit/shrink/flip placement (pure)', () => {
  it('fits fully above when there is enough room', () => {
    const space = bubbleVerticalAnchors(300, 320, 600);
    const plan = planBubbleFit(space, 200, 60, 24, MIN_VISIBLE_LIST_ROWS);
    expect(plan).toEqual({ side: 'above', listMaxHeight: null });
  });

  it('shrinks the list above, keeping at least the minimum rows, when the full height does not fit', () => {
    // 100px available above; full height 200 doesn't fit, but
    // chrome(60) + 3 rows * 24 = 132... too much — use a smaller chrome/row
    // so the minimum-rows floor actually fits within 100.
    const space = { above: 100, below: 400 };
    const plan = planBubbleFit(space, 200, 40, 15, 3); // min above = 40 + 45 = 85 <= 100
    expect(plan.side).toBe('above');
    expect(plan.listMaxHeight).toBe(100 - 40);
  });

  it('flips below when even the minimum-rows shrink does not fit above', () => {
    const space = { above: 50, below: 300 };
    const plan = planBubbleFit(space, 200, 40, 15, 3); // min above = 40 + 45 = 85 > 50
    expect(plan.side).toBe('below');
    expect(plan.listMaxHeight).toBeNull(); // 200 fits fully in the 300 available below
  });

  it('below also clamps when there is nowhere else to go', () => {
    const space = { above: 20, below: 60 };
    const plan = planBubbleFit(space, 200, 40, 15, 3); // doesn't fit above OR fully below
    expect(plan.side).toBe('below');
    expect(plan.listMaxHeight).toBe(60 - 40); // shrunk to whatever's left, even under 3 rows
  });

  it('never returns a negative list height below', () => {
    const space = { above: 0, below: 10 };
    const plan = planBubbleFit(space, 200, 40, 15, 3);
    expect(plan.listMaxHeight).toBe(0);
  });
});

describe('bubbleVerticalAnchors (pure)', () => {
  it('computes available space and CSS anchor points on both sides of the line', () => {
    const anchors = bubbleVerticalAnchors(300, 320, 600);
    expect(anchors.belowTop).toBe(322); // lineBottom + GAP(2)
    expect(anchors.below).toBe(600 - 8 - 322); // viewport - EDGE_MARGIN(8) - belowTop
    expect(anchors.aboveBottom).toBe(600 - 300 + 2);
    expect(anchors.above).toBe(300 - 2 - 8);
  });

  it('clamps space to zero rather than going negative near an edge', () => {
    const anchors = bubbleVerticalAnchors(5, 10, 600);
    expect(anchors.above).toBe(0);
  });
});

describe('clampBubbleLeft (pure)', () => {
  it('keeps the popup within the viewport, matching caret-position.ts’s own clampLeft', () => {
    expect(clampBubbleLeft(50, 240, 800)).toBe(50);
    expect(clampBubbleLeft(-10, 240, 800)).toBe(8);
    expect(clampBubbleLeft(700, 240, 800)).toBe(800 - 240 - 8);
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
