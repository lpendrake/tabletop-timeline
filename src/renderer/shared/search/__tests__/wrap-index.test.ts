import { describe, it, expect } from 'vitest';
import { wrapIndex } from '../wrap-index';

describe('wrapIndex', () => {
  it('wraps both directions and handles empty', () => {
    expect(wrapIndex(0, 1, 3)).toBe(1);
    expect(wrapIndex(2, 1, 3)).toBe(0);
    expect(wrapIndex(0, -1, 3)).toBe(2);
    expect(wrapIndex(1, -1, 3)).toBe(0);
    expect(wrapIndex(0, 1, 0)).toBe(-1);
    expect(wrapIndex(-1, -1, 0)).toBe(-1);
  });

  it('steps by more than one and still wraps', () => {
    expect(wrapIndex(0, 2, 3)).toBe(2);
    expect(wrapIndex(1, -3, 4)).toBe(2);
  });
});
