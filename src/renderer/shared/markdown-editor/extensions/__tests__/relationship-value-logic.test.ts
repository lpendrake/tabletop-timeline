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
  compareProximity,
  matchNoteOptions,
  sectionNotes,
  pinnedDefaultHolder,
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

describe('matchNoteOptions (pure)', () => {
  const options = [
    { id: 'a1', path: 'notes/factions/twc.md', label: 'The Whispering Claw' },
    { id: 'b2', path: 'notes/places/claws.md', label: 'Claw Hammer Inn' },
    { id: 'c3', path: 'notes/npcs/whisper.md', label: 'Whisper the Spy' },
  ];

  it('matches by title using entity-match semantics, not file path', () => {
    expect(matchNoteOptions(options, 'whispering').map((m) => m.option.id)).toEqual(['a1']);
    expect(matchNoteOptions(options, 'hammer').map((m) => m.option.id)).toEqual(['b2']);
  });

  it('gives every note the same rank for an empty query', () => {
    const matches = matchNoteOptions(options, '  ');
    expect(matches).toHaveLength(3);
    expect(new Set(matches.map((m) => m.rank)).size).toBe(1);
  });
});

describe('compareProximity (pure)', () => {
  it('orders nearest first and undated after every dated value', () => {
    expect([null, 90, 0, 5].sort(compareProximity)).toEqual([0, 5, 90, null]);
  });
});

describe('sanitiseValue (pure, shared)', () => {
  it('strips braces and collapses line breaks', () => {
    expect(sanitiseValue('a {b} c\nd')).toBe('a b c d');
  });
});

describe('pinnedDefaultHolder (pure)', () => {
  const options = [
    { id: 'a1', path: 'a1.md', label: 'Aldric' },
    { id: 'b2', path: 'b2.md', label: 'Borin' },
  ];
  const base = { role: 'holder' as const, query: '', defaultHolderId: 'b2', options };

  it('is the default holder on an empty holder query', () => {
    expect(pinnedDefaultHolder(base)).toBe(options[1]);
    expect(pinnedDefaultHolder({ ...base, query: '  ' })).toBe(options[1]);
  });

  it('is nothing for an observer, a typed query, no default or a default outside the choices', () => {
    expect(pinnedDefaultHolder({ ...base, role: 'observer' })).toBeNull();
    expect(pinnedDefaultHolder({ ...base, query: 'b' })).toBeNull();
    expect(pinnedDefaultHolder({ ...base, defaultHolderId: null })).toBeNull();
    expect(pinnedDefaultHolder({ ...base, options: [options[0]] })).toBeNull();
  });
});

describe('sectionNotes (pure)', () => {
  const DAY = 86400;
  const options = [
    { id: 'c3', path: 'c3.md', label: 'Charis' },
    { id: 'a1', path: 'a1.md', label: 'Aldric' },
    { id: 'b2', path: 'b2.md', label: 'Borin' },
    { id: 'd4', path: 'd4.md', label: 'Dessa' },
  ];
  const base = {
    role: 'observer' as const,
    options,
    query: '',
    usage: null,
    defaultHolderId: null,
  };
  const ids = (input: Parameters<typeof sectionNotes>[0]) =>
    sectionNotes(input).map((n) => n.option.id);
  const sections = (input: Parameters<typeof sectionNotes>[0]) =>
    sectionNotes(input).map((n) => n.section?.name ?? null);

  it('lists used notes above unused ones, in their own sections', () => {
    const usage = new Map([['d4', DAY]]);
    expect(ids({ ...base, usage })).toEqual(['d4', 'a1', 'b2', 'c3']);
    expect(sections({ ...base, usage })).toEqual([
      'Used on this track',
      'Not used on this track',
      'Not used on this track',
      'Not used on this track',
    ]);
  });

  it('puts every note under "not used", A-Z, when usage is unknown or empty', () => {
    expect(ids(base)).toEqual(['a1', 'b2', 'c3', 'd4']);
    expect(ids({ ...base, usage: new Map() })).toEqual(['a1', 'b2', 'c3', 'd4']);
    expect(new Set(sections(base))).toEqual(new Set(['Not used on this track']));
  });

  it('has no unused rows when every note is used', () => {
    const usage = new Map(options.map((o, i) => [o.id, i * DAY]));
    expect(new Set(sections({ ...base, usage }))).toEqual(new Set(['Used on this track']));
  });

  it('orders used notes by proximity, ties A-Z, dateless last', () => {
    const usage = new Map<string, number | null>([
      ['b2', DAY],
      ['a1', DAY],
      ['c3', 9 * DAY],
      ['d4', null],
    ]);
    expect(ids({ ...base, usage })).toEqual(['a1', 'b2', 'c3', 'd4']);
    const reversed = new Map<string, number | null>([
      ['d4', null],
      ['c3', 9 * DAY],
      ['a1', DAY],
      ['b2', DAY],
    ]);
    expect(ids({ ...base, usage: reversed })).toEqual(['a1', 'b2', 'c3', 'd4']);
  });

  it('puts unused notes A-Z whatever the input order', () => {
    expect(ids({ ...base, options: [...options].reverse() })).toEqual(['a1', 'b2', 'c3', 'd4']);
  });

  it('filters by the query, ranking the best text match first inside each section', () => {
    const opts = [
      { id: 'x1', path: 'x1.md', label: 'The Brass Gate' },
      { id: 'x2', path: 'x2.md', label: 'Gate Warden' },
      { id: 'x3', path: 'x3.md', label: 'Gatehouse' },
      { id: 'x4', path: 'x4.md', label: 'Unrelated' },
    ];
    const usage = new Map<string, number | null>([
      ['x1', DAY],
      ['x2', 5 * DAY],
    ]);
    const input = { ...base, options: opts, query: 'gate', usage };
    // Used: prefix match (x2) beats the nearer substring match (x1).
    expect(ids(input)).toEqual(['x2', 'x1', 'x3']);
    expect(sections({ ...input, query: 'house' })).toEqual(['Not used on this track']);
  });

  it('pins the default holder first, without a section, on an empty holder query only', () => {
    const usage = new Map([['d4', DAY]]);
    const holder = { ...base, role: 'holder' as const, usage, defaultHolderId: 'c3' };
    expect(ids(holder)).toEqual(['c3', 'd4', 'a1', 'b2']);
    expect(sections(holder)).toEqual([
      null,
      'Used on this track',
      'Not used on this track',
      'Not used on this track',
    ]);
    // Typing: it sits in its normal section.
    expect(ids({ ...holder, query: 'char' })).toEqual(['c3']);
    expect(sections({ ...holder, query: 'char' })).toEqual(['Not used on this track']);
    // An observer blank never pins it.
    expect(ids({ ...holder, role: 'observer' })).toEqual(['d4', 'a1', 'b2', 'c3']);
  });

  it('does not pin a default holder that was narrowed away', () => {
    const narrowed = options.filter((o) => o.id !== 'c3');
    expect(ids({ ...base, role: 'holder', options: narrowed, defaultHolderId: 'c3' })).toEqual([
      'a1',
      'b2',
      'd4',
    ]);
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
