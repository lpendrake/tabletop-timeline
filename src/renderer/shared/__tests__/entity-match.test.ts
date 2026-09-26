import { describe, it, expect } from 'vitest';
import { matchesEntityQuery, rankEntityMatch } from '../entity-match';

describe('matchesEntityQuery', () => {
  it('matches by title substring, case-insensitively', () => {
    expect(matchesEntityQuery('The Whispering Claw', 'n4', 'claw')).toBe(true);
    expect(matchesEntityQuery('The Whispering Claw', 'n4', 'CLAW')).toBe(true);
  });

  it('matches by id', () => {
    expect(matchesEntityQuery('The Whispering Claw', 'n4', 'n4')).toBe(true);
  });

  it('matches a multi-word query against the full title', () => {
    expect(matchesEntityQuery('The Whispering Claw', 'n4', 'whispering claw')).toBe(true);
    expect(matchesEntityQuery('The Whispering Claw', 'n4', 'The Whispering Claw')).toBe(true);
  });

  it('does not match when neither title nor id contains the query', () => {
    expect(matchesEntityQuery('The Whispering Claw', 'n4', 'xyzzy')).toBe(false);
  });
});

describe('rankEntityMatch', () => {
  it('ranks a title prefix match better than a mid-word substring match', () => {
    const prefix = rankEntityMatch('Whispering Claw', 'n4', 'whisper');
    const substring = rankEntityMatch('The Whispering Claw', 'n5', 'whisper');
    expect(prefix).not.toBeNull();
    expect(substring).not.toBeNull();
    expect(prefix!).toBeLessThan(substring!);
  });

  it('returns null when there is no match', () => {
    expect(rankEntityMatch('The Whispering Claw', 'n4', 'xyzzy')).toBeNull();
  });

  it('returns null for an empty query', () => {
    expect(rankEntityMatch('The Whispering Claw', 'n4', '')).toBeNull();
  });
});
