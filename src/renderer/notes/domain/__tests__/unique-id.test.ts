import { describe, it, expect } from 'vitest';
import { pickUnusedId } from '../unique-id';

describe('pickUnusedId', () => {
  it('regenerates on clash with existing ids', () => {
    const generated = ['aaaa', 'aaaa', 'bbbb'];
    let i = 0;
    const generate = () => generated[i++];
    const existingIds = new Set(['aaaa']);

    const id = pickUnusedId(generate, existingIds);

    expect(id).toBe('bbbb');
    expect(i).toBe(3);
  });

  it('returns the first id when there is no existingIds set', () => {
    const generate = () => 'aaaa';
    expect(pickUnusedId(generate)).toBe('aaaa');
  });

  it('throws after maxTries when every candidate clashes', () => {
    const generate = () => 'aaaa';
    const existingIds = new Set(['aaaa']);
    expect(() => pickUnusedId(generate, existingIds, 3)).toThrow();
  });
});
