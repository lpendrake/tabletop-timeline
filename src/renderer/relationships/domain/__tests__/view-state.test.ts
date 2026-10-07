import { describe, expect, it } from 'vitest';
import { resolveSortMode } from '../view-state';

describe('resolveSortMode', () => {
  it('numeric tracks default to My order and keep My order or a column sort', () => {
    expect(resolveSortMode('numeric', null)).toBe('mine');
    expect(resolveSortMode('numeric', 'mine')).toBe('mine');
    expect(resolveSortMode('numeric', { column: 'value', dir: 'asc' })).toEqual({
      column: 'value',
      dir: 'asc',
    });
  });

  it('numeric tracks reject the named modes they do not offer', () => {
    expect(resolveSortMode('numeric', 'alpha')).toBe('mine');
    expect(resolveSortMode('numeric', 'recent')).toBe('mine');
  });

  it('other kinds keep an offered mode and default to their first', () => {
    expect(resolveSortMode('ordinal', null)).toBe('recent');
    expect(resolveSortMode('ordinal', 'alpha')).toBe('alpha');
    expect(resolveSortMode('ordinal', 'value')).toBe('recent');
    expect(resolveSortMode('categorical', null)).toBe('mine');
    expect(resolveSortMode('categorical', 'value')).toBe('value');
  });

  it('a column sort chosen on an ordinal or categorical track resolves to that kind default', () => {
    const column = { column: 'band', dir: 'desc' } as const;
    expect(resolveSortMode('ordinal', column)).toBe('recent');
    expect(resolveSortMode('categorical', column)).toBe('mine');
  });
});
