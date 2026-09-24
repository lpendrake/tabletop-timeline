import { describe, it, expect } from 'vitest';
import { candidateFilename, pickUnusedId } from '../unique-filename';

describe('candidateFilename', () => {
  it('numbers from -2', () => {
    expect(candidateFilename('slug', 0)).toBe('slug.md');
    expect(candidateFilename('slug', 1)).toBe('slug-2.md');
    expect(candidateFilename('slug', 2)).toBe('slug-3.md');
  });
});

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
