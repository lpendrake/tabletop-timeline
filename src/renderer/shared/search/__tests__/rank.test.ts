import { describe, it, expect } from 'vitest';
import { rankMatch, compareRanked } from '../rank';

describe('rankMatch', () => {
  it('prefix beats word-prefix beats substring', () => {
    expect(rankMatch('Heading 1', 'hea')).toBe(0);
    expect(rankMatch('New heading', 'hea')).toBe(1);
    expect(rankMatch('Subheading', 'hea')).toBe(2);
  });

  it('is case-insensitive and trims the query', () => {
    expect(rankMatch('Heading 1', '  HEA ')).toBe(0);
    expect(rankMatch('Heading 1', 'hea')).toBe(0);
  });

  it('empty query returns null', () => {
    expect(rankMatch('Heading 1', '')).toBeNull();
    expect(rankMatch('Heading 1', '   ')).toBeNull();
  });

  it('non-matching returns null, no fuzzy', () => {
    expect(rankMatch('Heading', 'hdg')).toBeNull();
  });

  it('keywords can improve the rank', () => {
    // "hea" is only a substring of the label, but a prefix of a keyword.
    expect(rankMatch('Subheading', 'hea')).toBe(2);
    expect(rankMatch('Subheading', 'hea', ['heading'])).toBe(0);
  });

  it('checks every occurrence, not just the first', () => {
    // The first "head" (in "Unhead") is mid-word, but the second (in "head")
    // sits right at a word boundary — the word-prefix match must win.
    expect(rankMatch('Unhead head', 'head')).toBe(1);
  });
});

describe('compareRanked', () => {
  it('keeps input order on ties', () => {
    const items = [
      { rank: 1 as const, index: 0 },
      { rank: 0 as const, index: 1 },
      { rank: 1 as const, index: 2 },
      { rank: 0 as const, index: 3 },
    ];
    const sorted = [...items].sort(compareRanked);
    expect(sorted.map((i) => i.index)).toEqual([1, 3, 0, 2]);
  });
});
