import { describe, it, expect } from 'vitest';
import { findWikiLinksInLine } from '../wiki-links';
import {
  overrideLocalLabelChange,
  resetLocalLabelChange,
  resolveDisplayLabel,
  hasGlobalOverride,
} from '../wiki-link-context-menu';

/** Applies a {from, to, insert} change to a source string, the way CodeMirror would. */
function applyChange(source: string, change: { from: number; to: number; insert: string }) {
  return source.slice(0, change.from) + change.insert + source.slice(change.to);
}

describe('overrideLocalLabelChange', () => {
  it('inserts a label into a bare [[id]] link', () => {
    const source = '[[abcd]]';
    const [link] = findWikiLinksInLine(source, 0);
    const change = overrideLocalLabelChange(link, 'Foo Bar');
    expect(applyChange(source, change)).toBe('[[Foo Bar|abcd]]');
  });

  it('replaces only the label region of an already-labeled link', () => {
    const source = '[[Old|abcd]]';
    const [link] = findWikiLinksInLine(source, 0);
    const change = overrideLocalLabelChange(link, 'New');
    expect(applyChange(source, change)).toBe('[[New|abcd]]');
  });

  it('leaves surrounding text untouched when the link is mid-line', () => {
    const source = 'See [[abcd]] please';
    const [link] = findWikiLinksInLine(source, 0);
    const change = overrideLocalLabelChange(link, 'Alice');
    expect(applyChange(source, change)).toBe('See [[Alice|abcd]] please');
  });
});

describe('resetLocalLabelChange', () => {
  it('strips the local label from [[Some Label|abcd]] down to [[abcd]]', () => {
    const source = '[[Some Label|abcd]]';
    const [link] = findWikiLinksInLine(source, 0);
    const change = resetLocalLabelChange(link);
    expect(change).not.toBeNull();
    expect(applyChange(source, change!)).toBe('[[abcd]]');
  });

  it('returns null when the link has no local label', () => {
    const source = '[[abcd]]';
    const [link] = findWikiLinksInLine(source, 0);
    expect(resetLocalLabelChange(link)).toBeNull();
  });

  it('leaves surrounding text untouched when resetting a mid-line link', () => {
    const source = 'See [[Some Label|abcd]] please';
    const [link] = findWikiLinksInLine(source, 0);
    const change = resetLocalLabelChange(link);
    expect(applyChange(source, change!)).toBe('See [[abcd]] please');
  });
});

describe('resolveDisplayLabel', () => {
  it('prefers the local label when present', () => {
    const [link] = findWikiLinksInLine('[[Custom Name|abcd]]', 0);
    const map = new Map([['abcd', 'Entity Label']]);
    expect(resolveDisplayLabel(link, map)).toBe('Custom Name');
  });

  it('falls back to the entity label map when there is no local label', () => {
    const [link] = findWikiLinksInLine('[[abcd]]', 0);
    const map = new Map([['abcd', 'Entity Label']]);
    expect(resolveDisplayLabel(link, map)).toBe('Entity Label');
  });

  it('falls back to the raw id when neither a local label nor a map entry exists', () => {
    const [link] = findWikiLinksInLine('[[abcd]]', 0);
    expect(resolveDisplayLabel(link, new Map())).toBe('abcd');
  });
});

describe('hasGlobalOverride', () => {
  it('is false when the map has no entry for the id', () => {
    expect(hasGlobalOverride('abcd', new Map())).toBe(false);
  });

  it('is false when the map value equals the id (no override, just an identity entry)', () => {
    expect(hasGlobalOverride('abcd', new Map([['abcd', 'abcd']]))).toBe(false);
  });

  it('is true when the map value differs from the id', () => {
    expect(hasGlobalOverride('abcd', new Map([['abcd', 'Alice the Wizard']]))).toBe(true);
  });
});
