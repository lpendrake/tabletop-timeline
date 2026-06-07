import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  emptyBuffer,
  bufferFromEvent,
  bufferToFrontmatter,
  effectiveTitle,
  validateBuffer,
  deriveFilename,
  getColorPresetValue,
  parseTagsText,
  buildTagChips,
  hasReservedTagPrefix,
  addTagsToText,
  removeTagFromText,
  weekdayColorForDateText,
  type EditorBuffer,
} from '../domain';
import { ThemeProvider } from '../../../theme';
import { CalendarProvider } from '../../calendar/provider';
import type { Event } from '../../data/types';
import type { WeekdayColors } from '../../../theme/types';

// ---- helpers ----

function buf(overrides: Partial<EditorBuffer> = {}): EditorBuffer {
  return {
    title: 'Test Event',
    date: '4726-05-04',
    tagsText: '',
    color: '',
    body: '',
    tagLabelOverride: '',
    linkLabelOverride: '',
    systemTags: [],
    ...overrides,
  };
}

function event(overrides: Partial<Event> = {}): Event {
  return {
    filename: '4726-124-test.md',
    title: 'Test Event',
    date: '4726-05-04',
    tags: [],
    body: '',
    mtime: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  CalendarProvider._reset();
});

afterEach(() => {
  CalendarProvider._reset();
});

// ---- emptyBuffer ----

describe('emptyBuffer', () => {
  it('returns all empty strings when no initialDate', () => {
    const b = emptyBuffer();
    expect(b).toEqual({
      title: '',
      date: '',
      tagsText: '',
      color: '',
      body: '',
      tagLabelOverride: '',
      linkLabelOverride: '',
      systemTags: [],
    });
  });

  it('places initialDate in the date field', () => {
    const b = emptyBuffer('4726-03-01');
    expect(b.date).toBe('4726-03-01');
    expect(b.title).toBe('');
  });
});

// ---- parseTagsText ----

describe('parseTagsText', () => {
  it('splits comma-separated tags and trims whitespace', () => {
    expect(parseTagsText('a, b, c')).toEqual(['a', 'b', 'c']);
  });

  it('returns empty array for empty string', () => {
    expect(parseTagsText('')).toEqual([]);
  });

  it('ignores whitespace-only entries', () => {
    expect(parseTagsText('a, , b')).toEqual(['a', 'b']);
  });

  it('handles trailing comma', () => {
    expect(parseTagsText('a, b,')).toEqual(['a', 'b']);
  });

  it('handles single tag without comma', () => {
    expect(parseTagsText('combat')).toEqual(['combat']);
  });
});

// ---- bufferFromEvent ----

describe('bufferFromEvent', () => {
  it('maps event fields to buffer', () => {
    const ev = event({
      title: 'Big Battle',
      date: '4726-05-04T09:30',
      tags: ['combat', 'plot'],
      color: '#a83030',
      body: '# Notes\nHello',
    });
    const b = bufferFromEvent(ev);
    expect(b.title).toBe('Big Battle');
    expect(b.date).toBe('4726-05-04T09:30:00');
    expect(b.tagsText).toBe('combat, plot');
    expect(b.color).toBe('#a83030');
    expect(b.body).toBe('# Notes\nHello');
  });

  it('produces empty tagsText when event has no tags', () => {
    expect(bufferFromEvent(event({ tags: [] })).tagsText).toBe('');
  });

  it('handles missing tags array gracefully', () => {
    const ev = event();
    (ev as unknown as { tags?: string[] }).tags = undefined;
    expect(bufferFromEvent(ev).tagsText).toBe('');
  });

  it('maps missing color to empty string', () => {
    const ev = event();
    delete (ev as Partial<Event>).color;
    expect(bufferFromEvent(ev).color).toBe('');
  });

  it('excludes entity tags from tagsText', () => {
    const ev = event({ tags: ['combat', 'id:ab12', 'plot'] });
    expect(bufferFromEvent(ev).tagsText).toBe('combat, plot');
  });

  it('excludes session tags from tagsText', () => {
    const ev = event({ tags: ['combat', 'sesh:Session 1', 'plot'] });
    expect(bufferFromEvent(ev).tagsText).toBe('combat, plot');
  });

  it('produces empty tagsText when all tags are entity tags', () => {
    const ev = event({ tags: ['id:ab12', 'id:cd34'] });
    expect(bufferFromEvent(ev).tagsText).toBe('');
  });

  it('produces empty tagsText when all tags are session tags', () => {
    const ev = event({ tags: ['sesh:01', 'sesh:02'] });
    expect(bufferFromEvent(ev).tagsText).toBe('');
  });

  it('maps tagLabelOverride from frontmatter', () => {
    const ev = event({ tagLabelOverride: 'Custom Tag' });
    expect(bufferFromEvent(ev).tagLabelOverride).toBe('Custom Tag');
  });

  it('maps linkLabelOverride from frontmatter', () => {
    const ev = event({ linkLabelOverride: 'Custom Link' });
    expect(bufferFromEvent(ev).linkLabelOverride).toBe('Custom Link');
  });

  it('defaults override fields to empty string when absent', () => {
    const ev = event();
    expect(bufferFromEvent(ev).tagLabelOverride).toBe('');
    expect(bufferFromEvent(ev).linkLabelOverride).toBe('');
  });

  it('populates systemTags with session tags from the event', () => {
    const ev = event({ tags: ['combat', 'sesh:Session 1', 'id:ab12'] });
    expect(bufferFromEvent(ev).systemTags).toEqual(['sesh:Session 1']);
  });

  it('populates empty systemTags when the event has no session tags', () => {
    const ev = event({ tags: ['combat', 'id:ab12'] });
    expect(bufferFromEvent(ev).systemTags).toEqual([]);
  });

  it('normalizes a legacy ISO timestamp date to date-only when time is midnight', () => {
    const ev = event({ date: '4726-05-08T00:00:00.000Z' });
    expect(bufferFromEvent(ev).date).toBe('4726-05-08');
  });

  it('normalizes a partial time string to canonical form with seconds', () => {
    const ev = event({ date: '4726-05-04T09:30' });
    expect(bufferFromEvent(ev).date).toBe('4726-05-04T09:30:00');
  });

  it('preserves an unparseable date verbatim so validation can flag it', () => {
    const ev = event({ date: 'not-a-date' });
    expect(bufferFromEvent(ev).date).toBe('not-a-date');
  });

  it('uses epochSeconds to derive date text when present, ignoring date field', () => {
    const cal = CalendarProvider.get();
    // 4726-05-04 → parse and get epochSeconds
    const parsed = cal.tryParse('4726-05-04')!;
    const epochSeconds = cal.toEpochSeconds(parsed);
    // event has a wrong date field but correct epochSeconds
    const ev = event({ date: 'wrong-date', epochSeconds });
    const b = bufferFromEvent(ev);
    expect(b.date).toBe('4726-05-04');
  });

  it('round-trips epochSeconds through bufferFromEvent', () => {
    const cal = CalendarProvider.get();
    const parsed = cal.tryParse('4726-05-04T09:30:00')!;
    const epochSeconds = cal.toEpochSeconds(parsed);
    const ev = event({ date: '4726-05-04T09:30:00', epochSeconds });
    const b = bufferFromEvent(ev);
    expect(b.date).toBe('4726-05-04T09:30:00');
  });
});

// ---- bufferToFrontmatter ----

describe('bufferToFrontmatter', () => {
  it('splits tagsText by comma and trims whitespace', () => {
    const fm = bufferToFrontmatter(buf({ tagsText: 'a, b,  c' }));
    expect(fm.tags).toEqual(['a', 'b', 'c']);
  });

  it('omits tags field when tagsText is empty', () => {
    const fm = bufferToFrontmatter(buf({ tagsText: '' }));
    expect('tags' in fm).toBe(false);
  });

  it('omits color field when color is empty', () => {
    const fm = bufferToFrontmatter(buf({ color: '' }));
    expect('color' in fm).toBe(false);
  });

  it('includes color when set', () => {
    const fm = bufferToFrontmatter(buf({ color: '#a83030' }));
    expect(fm.color).toBe('#a83030');
  });

  it('trims title and date', () => {
    const fm = bufferToFrontmatter(buf({ title: '  My Event  ', date: '  4726-05-04  ' }));
    expect(fm.title).toBe('My Event');
    expect(fm.date).toBe('4726-05-04');
  });

  it('sets frontmatter title from body H1 when present', () => {
    const fm = bufferToFrontmatter(buf({ title: 'Old Title', body: '# H1 Title\nContent.' }));
    expect(fm.title).toBe('H1 Title');
  });

  it('falls back to buf.title when body has no H1', () => {
    const fm = bufferToFrontmatter(buf({ title: 'Buf Title', body: 'No heading.' }));
    expect(fm.title).toBe('Buf Title');
  });

  it('includes tagLabelOverride when set', () => {
    const fm = bufferToFrontmatter(buf({ tagLabelOverride: 'Custom Tag' }));
    expect(fm.tagLabelOverride).toBe('Custom Tag');
  });

  it('omits tagLabelOverride when empty', () => {
    const fm = bufferToFrontmatter(buf({ tagLabelOverride: '' }));
    expect('tagLabelOverride' in fm).toBe(false);
  });

  it('includes linkLabelOverride when set', () => {
    const fm = bufferToFrontmatter(buf({ linkLabelOverride: 'Custom Link' }));
    expect(fm.linkLabelOverride).toBe('Custom Link');
  });

  it('omits linkLabelOverride when empty', () => {
    const fm = bufferToFrontmatter(buf({ linkLabelOverride: '' }));
    expect('linkLabelOverride' in fm).toBe(false);
  });

  it('trims whitespace-only override values and omits them', () => {
    const fm = bufferToFrontmatter(buf({ tagLabelOverride: '   ', linkLabelOverride: '  ' }));
    expect('tagLabelOverride' in fm).toBe(false);
    expect('linkLabelOverride' in fm).toBe(false);
  });

  it('trims surrounding whitespace from override values on save', () => {
    const fm = bufferToFrontmatter(
      buf({ tagLabelOverride: '  My Tag  ', linkLabelOverride: ' Link ' }),
    );
    expect(fm.tagLabelOverride).toBe('My Tag');
    expect(fm.linkLabelOverride).toBe('Link');
  });

  it('syncs entity tags from wiki links in the body', () => {
    const fm = bufferToFrontmatter(
      buf({ tagsText: 'combat', body: 'Met [[ab12]] near [[Bob|cd34]]' }),
    );
    expect(fm.tags).toEqual(['combat', 'id:ab12', 'id:cd34']);
  });

  it('removes entity tags whose wiki links are no longer in the body', () => {
    const fm = bufferToFrontmatter(buf({ tagsText: 'combat, id:ab12', body: '' }));
    expect(fm.tags).toEqual(['combat']);
  });

  it('filters out manually-entered entity-format tags from tagsText', () => {
    const fm = bufferToFrontmatter(buf({ tagsText: 'id:ab12, combat', body: '' }));
    expect(fm.tags).toEqual(['combat']);
  });

  it('omits tags field entirely when only entity-format tags were typed', () => {
    const fm = bufferToFrontmatter(buf({ tagsText: 'id:ab12', body: '' }));
    expect('tags' in fm).toBe(false);
  });

  it('filters out manually-entered session tags from tagsText', () => {
    const fm = bufferToFrontmatter(buf({ tagsText: 'sesh:Session 1, combat', body: '' }));
    expect(fm.tags).toEqual(['combat']);
  });

  it('omits tags field entirely when only session tags were typed', () => {
    const fm = bufferToFrontmatter(buf({ tagsText: 'sesh:01', body: '' }));
    expect('tags' in fm).toBe(false);
  });

  it('preserves systemTags in the output', () => {
    const fm = bufferToFrontmatter(buf({ tagsText: 'combat', systemTags: ['sesh:01'] }));
    expect(fm.tags).toContain('sesh:01');
    expect(fm.tags).toContain('combat');
  });

  it('omits tags field when only systemTags and no custom/entity tags', () => {
    const fm = bufferToFrontmatter(buf({ tagsText: '', systemTags: [] }));
    expect('tags' in fm).toBe(false);
  });

  it('sets epochSeconds when the date parses', () => {
    const cal = CalendarProvider.get();
    const fm = bufferToFrontmatter(buf({ date: '4726-05-04' }));
    expect(fm.epochSeconds).toBeDefined();
    const parsed = cal.tryParse('4726-05-04')!;
    expect(fm.epochSeconds).toBe(cal.toEpochSeconds(parsed));
  });

  it('does not set epochSeconds when the date does not parse', () => {
    const fm = bufferToFrontmatter(buf({ date: 'not-a-date' }));
    expect('epochSeconds' in fm).toBe(false);
  });

  it('round-trips through bufferFromEvent', () => {
    const original = buf({
      title: 'Round-trip',
      date: '4726-03-15',
      tagsText: 'a, b',
      color: '#3d7a38',
      body: 'Hello',
      tagLabelOverride: 'My Tag',
      linkLabelOverride: 'My Link',
    });
    const fm = bufferToFrontmatter(original);
    const ev = event({
      ...fm,
      tags: fm.tags ?? [],
      color: fm.color ?? undefined,
      body: original.body,
    });
    const restored = bufferFromEvent(ev);
    expect(restored.title).toBe(original.title);
    expect(restored.date).toBe(original.date);
    expect(restored.color).toBe(original.color);
    // Tags may have whitespace differences
    expect(restored.tagsText.split(', ').sort()).toEqual(original.tagsText.split(', ').sort());
    expect(restored.tagLabelOverride).toBe(original.tagLabelOverride);
    expect(restored.linkLabelOverride).toBe(original.linkLabelOverride);
  });
});

// ---- effectiveTitle ----

describe('effectiveTitle', () => {
  it('prefers the body H1 over the title field', () => {
    expect(effectiveTitle(buf({ title: 'Old Title', body: '# New Heading\nText' }))).toBe(
      'New Heading',
    );
  });

  it('falls back to the title field when the body has no H1', () => {
    expect(effectiveTitle(buf({ title: 'Just Title', body: 'No heading here.' }))).toBe(
      'Just Title',
    );
  });

  it('tracks the H1 as it changes, ignoring a stale title field', () => {
    expect(
      effectiveTitle(buf({ title: 'Walking up the mountain', body: '# Walking up the mountains' })),
    ).toBe('Walking up the mountains');
  });

  it('trims surrounding whitespace from the H1', () => {
    expect(effectiveTitle(buf({ title: '', body: '#   Spaced Out   \nBody' }))).toBe('Spaced Out');
  });

  it('returns an empty string when there is no H1 and no title', () => {
    expect(effectiveTitle(buf({ title: '', body: 'plain text' }))).toBe('');
  });
});

// ---- addTagsToText ----

describe('addTagsToText', () => {
  it('adds new tags to an empty list', () => {
    expect(addTagsToText('', 'combat, plot')).toBe('combat, plot');
  });

  it('appends new tags to existing ones', () => {
    expect(addTagsToText('combat', 'plot, location:fort')).toBe('combat, plot, location:fort');
  });

  it('deduplicates tags already present', () => {
    expect(addTagsToText('combat, plot', 'combat, location:fort')).toBe(
      'combat, plot, location:fort',
    );
  });

  it('returns unchanged text when all inputs are duplicates', () => {
    expect(addTagsToText('combat', 'combat')).toBe('combat');
  });

  it('silently ignores reserved-format tags', () => {
    expect(addTagsToText('combat', 'id:ab12, sesh:01, plot')).toBe('combat, plot');
  });

  it('returns unchanged text when input is empty', () => {
    expect(addTagsToText('combat', '')).toBe('combat');
  });
});

// ---- removeTagFromText ----

describe('removeTagFromText', () => {
  it('removes a tag from a list', () => {
    expect(removeTagFromText('combat, plot', 'combat')).toBe('plot');
  });

  it('returns empty string when the only tag is removed', () => {
    expect(removeTagFromText('combat', 'combat')).toBe('');
  });

  it('returns unchanged text when tag is not present', () => {
    expect(removeTagFromText('combat, plot', 'npc')).toBe('combat, plot');
  });

  it('removes only the matching tag when multiple exist', () => {
    expect(removeTagFromText('combat, plot, location:fort', 'plot')).toBe('combat, location:fort');
  });
});

// ---- hasReservedTagPrefix ----

describe('hasReservedTagPrefix', () => {
  it('returns false for empty tagsText', () => {
    expect(hasReservedTagPrefix('')).toBe(false);
  });

  it('returns false for normal tags', () => {
    expect(hasReservedTagPrefix('combat, plot, location:fort')).toBe(false);
  });

  it('returns true when a tag matches id:XXXX format', () => {
    expect(hasReservedTagPrefix('id:ab12')).toBe(true);
  });

  it('returns true when a tag matches sesh: format', () => {
    expect(hasReservedTagPrefix('sesh:Session 1')).toBe(true);
    expect(hasReservedTagPrefix('sesh:01')).toBe(true);
  });

  it('returns true when one of multiple tags matches', () => {
    expect(hasReservedTagPrefix('combat, id:ab12, plot')).toBe(true);
    expect(hasReservedTagPrefix('combat, sesh:01, plot')).toBe(true);
  });

  it('returns false for tags that start with id: but do not match the 4-char format', () => {
    expect(hasReservedTagPrefix('id:toolong')).toBe(false);
    expect(hasReservedTagPrefix('id:abc')).toBe(false);
  });
});

// ---- buildTagChips ----

describe('buildTagChips', () => {
  const resolvedMap = new Map([['ab12', 'Bob the Wizard']]);
  const emptyMap = new Map<string, string>();

  it('returns custom tag chips from tagsText', () => {
    const chips = buildTagChips('combat, plot', '', emptyMap);
    expect(chips).toEqual([
      { raw: 'combat', display: 'combat', isEntity: false },
      { raw: 'plot', display: 'plot', isEntity: false },
    ]);
  });

  it('returns resolved entity chips from wiki links in body', () => {
    const chips = buildTagChips('', '[[ab12]]', resolvedMap);
    expect(chips).toEqual([{ raw: 'id:ab12', display: 'Bob the Wizard', isEntity: true }]);
  });

  it('shows raw id:xxxx when entity is not in the label map', () => {
    const chips = buildTagChips('', '[[zz99]]', emptyMap);
    expect(chips).toEqual([{ raw: 'id:zz99', display: 'id:zz99', isEntity: true }]);
  });

  it('combines custom and entity chips', () => {
    const chips = buildTagChips('combat', '[[ab12]]', resolvedMap);
    expect(chips).toEqual([
      { raw: 'combat', display: 'combat', isEntity: false },
      { raw: 'id:ab12', display: 'Bob the Wizard', isEntity: true },
    ]);
  });

  it('returns empty array when tagsText is empty and body has no wiki links', () => {
    expect(buildTagChips('', '', emptyMap)).toEqual([]);
  });

  it('ignores entity tags that may have been manually typed into tagsText', () => {
    const chips = buildTagChips('id:ab12', '', resolvedMap);
    expect(chips).toEqual([{ raw: 'id:ab12', display: 'id:ab12', isEntity: false }]);
  });

  it('includes systemTags as non-entity chips between custom and entity chips', () => {
    const chips = buildTagChips('combat', '[[ab12]]', resolvedMap, ['sesh:01']);
    expect(chips).toEqual([
      { raw: 'combat', display: 'combat', isEntity: false },
      { raw: 'sesh:01', display: 'sesh:01', isEntity: false },
      { raw: 'id:ab12', display: 'Bob the Wizard', isEntity: true },
    ]);
  });

  it('defaults systemTags to empty when not provided', () => {
    const chips = buildTagChips('combat', '', emptyMap);
    expect(chips).toEqual([{ raw: 'combat', display: 'combat', isEntity: false }]);
  });
});

// ---- validateBuffer ----

describe('validateBuffer', () => {
  it('returns null for a valid buffer', () => {
    expect(validateBuffer(buf())).toBeNull();
  });

  it('returns error when title field is empty and body has no H1', () => {
    expect(validateBuffer(buf({ title: '', body: 'no heading here' }))).toBe('Title is required.');
  });

  it('returns error when title field is whitespace only and body has no H1', () => {
    expect(validateBuffer(buf({ title: '   ', body: '' }))).toBe('Title is required.');
  });

  it('returns null when title field is empty but body has an H1', () => {
    expect(validateBuffer(buf({ title: '', body: '# H1 Title\nContent.' }))).toBeNull();
  });

  it('returns null when title field is whitespace-only but body has an H1', () => {
    expect(validateBuffer(buf({ title: '   ', body: '# My Event\nContent.' }))).toBeNull();
  });

  it('returns error when date is empty', () => {
    expect(validateBuffer(buf({ date: '' }))).toBe('Date is required.');
  });

  it('returns error when date is invalid for this calendar', () => {
    const err = validateBuffer(buf({ date: 'not-a-date' }));
    expect(err).not.toBeNull();
    expect(err).toMatch(/not valid for this calendar/i);
    expect(err).not.toMatch(/golarian/i);
  });

  it('accepts date with time component', () => {
    expect(validateBuffer(buf({ date: '4726-05-04T09:30' }))).toBeNull();
  });
});

// ---- deriveFilename ----

describe('deriveFilename', () => {
  // Golarion 4726-05-04:
  //   months before May: Jan(31) + Feb(28) + Mar(31) + Apr(30) = 120
  //   + day 4 = day-of-year 124
  // Expected prefix: 4726-124
  it('uses YYYY-DDD scheme: 4726-05-04 → day-of-year 124 → prefix 4726-124', () => {
    expect(deriveFilename(buf({ title: 'The Big Heist', body: '', date: '4726-05-04' }))).toBe(
      '4726-124-the-big-heist.md',
    );
  });

  it('uses H1 from body as slug when present', () => {
    expect(
      deriveFilename(
        buf({ title: 'Old Title', body: '# The Big Heist\nSome text', date: '4726-05-04' }),
      ),
    ).toBe('4726-124-the-big-heist.md');
  });

  it('falls back to title when body has no H1', () => {
    expect(
      deriveFilename(buf({ title: 'The Big Heist', body: 'Just prose', date: '4726-05-04' })),
    ).toBe('4726-124-the-big-heist.md');
  });

  it('uses "event" fallback when body has no H1 and title is blank', () => {
    expect(deriveFilename(buf({ title: '', body: '', date: '4726-05-04' }))).toBe(
      '4726-124-event.md',
    );
  });

  it('includes Thhmmss (no colons) when date has non-zero time component', () => {
    expect(deriveFilename(buf({ title: 'Battle', body: '', date: '4726-05-04T09:30:00' }))).toBe(
      '4726-124T093000-battle.md',
    );
  });

  it('uses date-only prefix (no T suffix) when time is midnight', () => {
    expect(deriveFilename(buf({ title: 'Battle', body: '', date: '4726-05-04T00:00:00' }))).toBe(
      '4726-124-battle.md',
    );
  });

  it('uses date-only prefix when date has no time component', () => {
    expect(deriveFilename(buf({ title: 'Battle', body: '', date: '4726-05-04' }))).toBe(
      '4726-124-battle.md',
    );
  });

  it('produces correct day-of-year for month 1 day 1', () => {
    // 4726-01-01 → day-of-year 1
    expect(deriveFilename(buf({ title: 'Start', body: '', date: '4726-01-01' }))).toBe(
      '4726-001-start.md',
    );
  });

  it('produces correct day-of-year for last day of year (non-leap)', () => {
    // Golarion 4726 is not a leap year: 365 days → 4726-12-31 = day 365
    expect(deriveFilename(buf({ title: 'End', body: '', date: '4726-12-31' }))).toBe(
      '4726-365-end.md',
    );
  });

  it('strips apostrophes from H1', () => {
    expect(deriveFilename(buf({ title: '', body: "# It's Time\n", date: '4726-05-04' }))).toBe(
      '4726-124-its-time.md',
    );
  });

  it('truncates slug at 60 characters', () => {
    const longH1 = '# ' + 'a'.repeat(80);
    const filename = deriveFilename(buf({ title: '', body: longH1, date: '4726-05-04' }));
    const slug = filename.replace('4726-124-', '').replace('.md', '');
    expect(slug.length).toBeLessThanOrEqual(60);
  });

  it('replaces non-alphanumeric runs with single dash', () => {
    expect(
      deriveFilename(buf({ title: '', body: '# Battle!!! At Dawn', date: '4726-01-01' })),
    ).toBe('4726-001-battle-at-dawn.md');
  });

  it('strips leading/trailing dashes from slug', () => {
    expect(deriveFilename(buf({ title: '', body: '# ---Test---', date: '4726-01-01' }))).toBe(
      '4726-001-test.md',
    );
  });

  it('produces no "." or "Z" in filename when date is a legacy ISO timestamp with milliseconds', () => {
    const filename = deriveFilename(
      buf({ title: '', body: '# The Big Battle\n', date: '4726-05-08T00:00:00.000Z' }),
    );
    // Only allowed "." is the .md extension
    expect(filename.slice(0, -3)).not.toContain('.');
    expect(filename).not.toContain('Z');
    expect(filename.endsWith('.md')).toBe(true);
    // midnight collapses to date-only prefix (YYYY-DDD scheme)
    // 4726-05-08: Jan(31)+Feb(28)+Mar(31)+Apr(30)+May days 1-8 = 120+8 = 128
    expect(filename).toBe('4726-128-the-big-battle.md');
  });

  it('includes Thhmmss with colons stripped for a timed date', () => {
    // 4726-05-08: day 128
    expect(deriveFilename(buf({ title: 'Battle', body: '', date: '4726-05-08T09:30:00' }))).toBe(
      '4726-128T093000-battle.md',
    );
  });

  it('produces a filename matching /^[A-Za-z0-9._-]+\\.md$/', () => {
    const filename = deriveFilename(buf({ title: 'Test Event', body: '', date: '4726-05-04' }));
    expect(filename).toMatch(/^[A-Za-z0-9._-]+\.md$/);
  });
});

// ---- ThemeProvider.get().timeline.eventColorPresets ----

describe('ThemeProvider.get().timeline.eventColorPresets', () => {
  it('contains the default (empty) preset', () => {
    expect(ThemeProvider.get().timeline.eventColorPresets.some((p) => p.value === '')).toBe(true);
  });

  it('contains the custom sentinel', () => {
    expect(
      ThemeProvider.get().timeline.eventColorPresets.some((p) => p.value === '__custom__'),
    ).toBe(true);
  });

  it('has named color presets', () => {
    expect(ThemeProvider.get().timeline.eventColorPresets.some((p) => p.value === '#a83030')).toBe(
      true,
    );
  });
});

// ---- getColorPresetValue ----

describe('getColorPresetValue', () => {
  it('returns empty string for empty color', () => {
    expect(getColorPresetValue('')).toBe('');
  });

  it('returns the preset value when color matches a preset', () => {
    expect(getColorPresetValue('#a83030')).toBe('#a83030');
  });

  it('returns __custom__ for a non-preset hex value', () => {
    expect(getColorPresetValue('#ff1234')).toBe('__custom__');
  });

  it('does not treat __custom__ itself as a valid preset', () => {
    expect(getColorPresetValue('__custom__')).toBe('__custom__');
  });
});

// ---- weekdayColorForDateText ----

describe('weekdayColorForDateText', () => {
  // Seven distinct sentinel hexes, one per weekday index (Golarion week: mon=0…sun=6).
  const fakeWeekdays: WeekdayColors = [
    '#aa0001', // 0 — monday
    '#aa0002', // 1 — tuesday
    '#aa0003', // 2 — wednesday
    '#aa0004', // 3 — thursday
    '#aa0005', // 4 — friday
    '#aa0006', // 5 — saturday
    '#aa0007', // 6 — sunday
  ];

  it('returns null for an empty string', () => {
    expect(weekdayColorForDateText('', fakeWeekdays)).toBeNull();
  });

  it('returns null for an unparseable string', () => {
    expect(weekdayColorForDateText('not-a-date', fakeWeekdays)).toBeNull();
  });

  it('returns one of the seven weekday colours for a valid date', () => {
    const result = weekdayColorForDateText('4726-05-04', fakeWeekdays);
    expect(result).not.toBeNull();
    const values = Object.values(fakeWeekdays);
    expect(values).toContain(result);
  });

  it('returns the same colour for two dates exactly 7 days apart', () => {
    // 4726-05-04 and 4726-05-11 are exactly one week apart.
    const a = weekdayColorForDateText('4726-05-04', fakeWeekdays);
    const b = weekdayColorForDateText('4726-05-11', fakeWeekdays);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });

  it('returns different colours for two consecutive days', () => {
    const a = weekdayColorForDateText('4726-05-04', fakeWeekdays);
    const b = weekdayColorForDateText('4726-05-05', fakeWeekdays);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toBe(b);
  });
});
