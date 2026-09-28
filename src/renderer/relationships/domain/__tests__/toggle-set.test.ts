import { describe, it, expect } from 'vitest';
import { toggleInSet } from '../toggle-set';

describe('toggleInSet', () => {
  it('adds a key not already present', () => {
    const result = toggleInSet(new Set(), 'a');
    expect(result.has('a')).toBe(true);
  });

  it('removes a key already present', () => {
    const result = toggleInSet(new Set(['a']), 'a');
    expect(result.has('a')).toBe(false);
  });

  it('does not mutate the input set', () => {
    const input = new Set(['a']);
    toggleInSet(input, 'b');
    expect(input.has('b')).toBe(false);
  });
});
