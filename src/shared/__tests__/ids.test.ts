import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateShortId } from '../ids';

describe('generateShortId', () => {
  it('should return a string of length 4', () => {
    const id = generateShortId();
    expect(id).toHaveLength(4);
    expect(typeof id).toBe('string');
  });

  it('should only contain alphanumeric characters', () => {
    const regex = /^[a-z0-9]{4}$/;
    for (let i = 0; i < 100; i++) {
      expect(generateShortId()).toMatch(regex);
    }
  });

  it('should be reasonably unique (low collision in small samples)', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateShortId());
    }
    // With 1.68M possible IDs, the birthday problem gives ~0.03% chance of
    // any collision in 1000 samples.  Allow up to 2 collisions so the test
    // is non-flaky while still failing if the generator is badly broken.
    expect(ids.size).toBeGreaterThanOrEqual(998);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('avoids ids in the existing set', () => {
    // Four Math.random() calls produce 'aaaa', the next four 'bbbb'.
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.03)
      .mockReturnValueOnce(0.03)
      .mockReturnValueOnce(0.03)
      .mockReturnValueOnce(0.03);

    const id = generateShortId(new Set(['aaaa']));

    expect(id).toBe('bbbb');
  });

  it('returns the first id when there is no existing set', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(generateShortId()).toBe('aaaa');
  });

  it('throws after bounded retries when every candidate clashes', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // always generates 'aaaa'
    expect(() => generateShortId(new Set(['aaaa']))).toThrow();
  });
});
