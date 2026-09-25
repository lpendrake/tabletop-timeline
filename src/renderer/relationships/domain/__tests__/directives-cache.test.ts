import { describe, it, expect } from 'vitest';
import { withoutPaths } from '../directives-cache';

describe('withoutPaths', () => {
  it('removes the given keys', () => {
    const cache = { 'a.md': { directives: [] }, 'b.md': { directives: [] } };
    const result = withoutPaths(cache, ['a.md']);
    expect(result).toEqual({ 'b.md': { directives: [] } });
  });

  it('returns the same reference when nothing changes', () => {
    const cache = { 'a.md': { directives: [] } };
    expect(withoutPaths(cache, [])).toBe(cache);
    expect(withoutPaths(cache, ['missing.md'])).toBe(cache);
  });

  it('does not mutate the input cache', () => {
    const cache = { 'a.md': { directives: [] } };
    withoutPaths(cache, ['a.md']);
    expect(cache).toEqual({ 'a.md': { directives: [] } });
  });
});
