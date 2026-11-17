import { describe, it, expect } from 'vitest';
import { resolveRendererSource } from '../renderer-source.js';

describe('resolveRendererSource', () => {
  it('unpackaged app with TT_RENDERER=dist loads the built renderer', () => {
    expect(resolveRendererSource(false, { TT_RENDERER: 'dist' })).toBe('dist');
  });

  it('unpackaged app without TT_RENDERER loads the dev server', () => {
    expect(resolveRendererSource(false, {})).toBe('dev-server');
    expect(resolveRendererSource(false, { TT_RENDERER: '' })).toBe('dev-server');
  });

  it('packaged app loads the built renderer whatever TT_RENDERER says', () => {
    expect(resolveRendererSource(true, {})).toBe('dist');
    expect(resolveRendererSource(true, { TT_RENDERER: 'dist' })).toBe('dist');
    expect(resolveRendererSource(true, { TT_RENDERER: 'dsit' })).toBe('dist');
  });

  it('unpackaged app with an unrecognised TT_RENDERER value fails naming the accepted value', () => {
    expect(() => resolveRendererSource(false, { TT_RENDERER: 'dsit' })).toThrow(
      'TT_RENDERER must be "dist" or unset, got "dsit"',
    );
  });
});
