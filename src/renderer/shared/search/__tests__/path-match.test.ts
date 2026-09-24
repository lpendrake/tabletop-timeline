import { describe, it, expect } from 'vitest';
import { matchPath } from '../path-match';

describe('matchPath', () => {
  it('segment query finds deep folder', () => {
    expect(matchPath('factions/the-house-of-storms/spies', 'storm/spies')).toBe(0);
  });

  it('intermediate folders match', () => {
    // "storm" is a word-prefix match inside "the-house-of-storms" (boundary after '-').
    expect(matchPath('factions/the-house-of-storms', 'storm')).toBe(1);
  });

  it('segments out of order do not match', () => {
    expect(matchPath('factions/the-house-of-storms/spies', 'spies/storm')).toBeNull();
  });

  it('each query segment must hit a distinct later path segment', () => {
    expect(matchPath('spies/foo', 'spies/spies')).toBeNull();
    expect(matchPath('a/spies', 'a/spies')).toBe(0);
  });

  it('trailing slash ignored', () => {
    expect(matchPath('factions/the-house-of-storms', 'storm/')).toBe(
      matchPath('factions/the-house-of-storms', 'storm'),
    );
  });

  it('matches a single top-level segment', () => {
    expect(matchPath('npcs', 'n')).toBe(0);
  });

  it('empty query returns null', () => {
    expect(matchPath('npcs', '')).toBeNull();
    expect(matchPath('npcs', '/')).toBeNull();
  });
});
