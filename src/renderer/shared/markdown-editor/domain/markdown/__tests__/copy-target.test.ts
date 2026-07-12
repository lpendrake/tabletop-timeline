import { describe, it, expect } from 'vitest';
import { resolveCopyTarget } from '../copy-target';

describe('resolveCopyTarget', () => {
  it('returns the selection text when the selection is non-empty', () => {
    expect(resolveCopyTarget('foo bar baz', 4, 7)).toBe('bar');
  });

  it('returns the current line text when the selection is empty (caret)', () => {
    const doc = 'foo\nbar\nbaz';
    // caret at position 5, inside "bar"
    expect(resolveCopyTarget(doc, 5, 5)).toBe('bar');
  });

  it('returns the current line text for a caret at the start of the document', () => {
    const doc = 'first line\nsecond line';
    expect(resolveCopyTarget(doc, 0, 0)).toBe('first line');
  });

  it('returns a multi-line selection verbatim (not line-resolved)', () => {
    const doc = 'foo\nbar\nbaz';
    expect(resolveCopyTarget(doc, 0, 7)).toBe('foo\nbar');
  });
});
