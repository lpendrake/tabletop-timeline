import { describe, it, expect } from 'vitest';
import {
  stepAmount,
  stepNumericValue,
  stepRung,
  shouldOfferCreateOption,
  allowsCreateOption,
  filterHeldOptions,
  unionHeldTags,
  observersHoldingTag,
  buildNotePickerRecents,
  rankNoteOptions,
  noteChoices,
  rankLabelled,
} from '../relationship-value-logic';
import { resolveTrackSpec, sanitiseValue } from '../../../../../shared/relationships';
import { pf2eReputationSpec, attitudeSpec } from '../../../../../shared/relationships/system/index';

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

  it('only an Add action can offer Create — never Remove/Change/Set, and never an unresolved action', () => {
    expect(allowsCreateOption('add')).toBe(true);
    expect(allowsCreateOption('remove')).toBe(false);
    expect(allowsCreateOption('set')).toBe(false);
    expect(allowsCreateOption('adjust')).toBe(false);
    expect(allowsCreateOption(undefined)).toBe(false);
  });
});

describe('unionHeldTags / observersHoldingTag (pure)', () => {
  const byObserver = new Map([
    ['oaaa', ['member', 'married']],
    ['obbb', ['hates']],
  ]);

  it('unions held tags across every observer', () => {
    expect(unionHeldTags(byObserver).sort()).toEqual(['hates', 'married', 'member']);
  });

  it('an empty map unions to nothing', () => {
    expect(unionHeldTags(new Map())).toEqual([]);
  });

  it('returns only the observers holding the given tag', () => {
    expect(observersHoldingTag(byObserver, 'member')).toEqual(['oaaa']);
    expect(observersHoldingTag(byObserver, 'hates')).toEqual(['obbb']);
    expect(observersHoldingTag(byObserver, 'nope')).toEqual([]);
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

describe('rankNoteOptions (pure)', () => {
  const options = [
    { id: 'a1', path: 'notes/factions/twc.md', label: 'The Whispering Claw' },
    { id: 'b2', path: 'notes/places/claws.md', label: 'Claw Hammer Inn' },
    { id: 'c3', path: 'notes/npcs/whisper.md', label: 'Whisper the Spy' },
  ];

  it('ranks by title using entity-match semantics (title/id substring)', () => {
    const ranked = rankNoteOptions(options, 'whispering');
    // Should find "The Whispering Claw" by title substring
    expect(ranked[0]?.id).toBe('a1');
  });

  it('finds options by title when path does not match', () => {
    const ranked = rankNoteOptions(options, 'hammer');
    // "Claw Hammer Inn" matches by title, not by path
    expect(ranked[0]?.id).toBe('b2');
  });

  it('an empty query returns recents first', () => {
    const ranked = rankNoteOptions(options, '', ['c3', 'a1']);
    // With recents, c3 should come first, then a1
    expect(ranked[0]?.id).toBe('c3');
    expect(ranked[1]?.id).toBe('a1');
    expect(ranked[2]?.id).toBe('b2');
  });

  it('returns all options when there is no query', () => {
    const ranked = rankNoteOptions(options, '');
    expect(ranked.length).toBe(3);
  });
});

describe('sanitiseValue (pure, shared)', () => {
  it('strips braces and collapses line breaks', () => {
    expect(sanitiseValue('a {b} c\nd')).toBe('a b c d');
  });
});

describe('noteChoices (pure)', () => {
  const options = [
    { id: 'a1', path: 'a1.md', label: 'The Vanguard' },
    { id: 'b2', path: 'b2.md', label: 'Spire Watch' },
    { id: 'c3', path: 'c3.md', label: 'Borin Stoneberg' },
  ];
  const base = {
    options,
    query: '',
    recentNoteIds: ['c3'],
    currentNoteId: null,
    defaultHolderId: null,
    restrictedIds: null,
  };

  it('leads an empty query with recents, then everything else', () => {
    expect(noteChoices({ ...base, role: 'observer' }).map((o) => o.id)).toEqual(['c3', 'a1', 'b2']);
  });

  it('puts the default holder first for a holder blank only', () => {
    const withDefault = { ...base, defaultHolderId: 'b2' };
    expect(noteChoices({ ...withDefault, role: 'holder' })[0].id).toBe('b2');
    expect(noteChoices({ ...withDefault, role: 'observer' })[0].id).toBe('c3');
  });

  it('pins the open note ahead of other recents', () => {
    expect(noteChoices({ ...base, role: 'observer', currentNoteId: 'a1' })[0].id).toBe('a1');
  });

  it('ranks a typed query by title and respects a restriction list', () => {
    expect(noteChoices({ ...base, role: 'observer', query: 'spire' }).map((o) => o.id)).toEqual([
      'b2',
    ]);
    expect(
      noteChoices({ ...base, role: 'observer', restrictedIds: ['a1'] }).map((o) => o.id),
    ).toEqual(['a1']);
  });
});

describe('rankLabelled (pure)', () => {
  const options = [
    { id: 'member', path: 'member', label: 'member' },
    { id: 'sponsored-by', path: 'Sponsored By', label: 'Sponsored By' },
    { id: 'business-partner', path: 'business partner', label: 'business partner' },
  ];

  it('keeps the given order for an empty query', () => {
    expect(rankLabelled(options, '').map((o) => o.id)).toEqual([
      'member',
      'sponsored-by',
      'business-partner',
    ]);
  });

  it('ranks like menu search: prefix, then word start, then substring', () => {
    const words = [
      { id: 'swatter', path: 'swatter', label: 'swatter' },
      { id: 'spire', path: 'Spire Watch', label: 'Spire Watch' },
    ];
    expect(rankLabelled(words, 'wat').map((o) => o.id)).toEqual(['spire', 'swatter']);
  });

  it('puts prefix matches before word-start and substring matches, case-insensitively', () => {
    expect(rankLabelled(options, 'b').map((o) => o.id)).toEqual([
      'business-partner',
      'sponsored-by',
      'member',
    ]);
    expect(rankLabelled(options, 'SPON').map((o) => o.id)).toEqual(['sponsored-by']);
  });
});
