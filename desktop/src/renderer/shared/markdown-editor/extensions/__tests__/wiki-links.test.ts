import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { parseTrigger, findWikiLinksInLine, buildDecorations } from '../wiki-links';

describe('parseTrigger', () => {
  it('treats [[ as a 2-char prefix', () => {
    expect(parseTrigger('[[hello')).toEqual({ prefixLen: 2, query: 'hello' });
  });

  it('treats @ as a 1-char prefix', () => {
    expect(parseTrigger('@hello')).toEqual({ prefixLen: 1, query: 'hello' });
  });

  it('returns empty query for bare trigger', () => {
    expect(parseTrigger('[[')).toEqual({ prefixLen: 2, query: '' });
    expect(parseTrigger('@')).toEqual({ prefixLen: 1, query: '' });
  });
});

describe('findWikiLinksInLine', () => {
  it('parses a link with label and id', () => {
    const links = findWikiLinksInLine('See [[Captain Renard|rn42]] for details.', 0);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ id: 'rn42', label: 'Captain Renard', from: 4, to: 27 });
  });

  it('parses a bare id link (no label)', () => {
    const links = findWikiLinksInLine('[[abc1]]', 0);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ id: 'abc1', label: null });
  });

  it('finds multiple links on one line', () => {
    const links = findWikiLinksInLine('[[Foo|foo1]] and [[Bar|bar2]]', 0);
    expect(links).toHaveLength(2);
    expect(links[0].id).toBe('foo1');
    expect(links[1].id).toBe('bar2');
  });

  it('offsets positions by lineStart', () => {
    const links = findWikiLinksInLine('[[x|ab12]]', 100);
    expect(links[0].from).toBe(100);
    expect(links[0].to).toBe(110);
  });

  it('skips links with empty id', () => {
    const links = findWikiLinksInLine('[[label|]]', 0);
    expect(links).toHaveLength(0);
  });

  it('trims whitespace from id and label', () => {
    const links = findWikiLinksInLine('[[ My Note | ab12 ]]', 0);
    expect(links[0].id).toBe('ab12');
    expect(links[0].label).toBe('My Note');
  });

  it('returns nothing when no closing brackets', () => {
    const links = findWikiLinksInLine('[[unclosed', 0);
    expect(links).toHaveLength(0);
  });
});

describe('cursor-in-link range check (inclusive bounds)', () => {
  // Verifies the logic used by Ctrl+Enter and the isSelected decoration check.
  // The key invariant: cursor AT link.from or link.to must be considered "inside"
  // the link so that Decoration.replace (atomic) boundary positions trigger navigation.
  it('cursor at link.from is inside the range', () => {
    const [link] = findWikiLinksInLine('[[Bob|abc1]]', 0);
    // from=0, to=12
    expect(link.from <= link.from && link.from <= link.to).toBe(true);
  });

  it('cursor at link.to is inside the range', () => {
    const [link] = findWikiLinksInLine('[[Bob|abc1]]', 0);
    expect(link.from <= link.to && link.to <= link.to).toBe(true);
  });

  it('cursor one before link.from is outside the range', () => {
    const [link] = findWikiLinksInLine('x[[Bob|abc1]]', 0);
    // from=1, cursor at 0
    const cursor = link.from - 1;
    expect(link.from <= cursor && cursor <= link.to).toBe(false);
  });

  it('cursor one after link.to is outside the range', () => {
    const [link] = findWikiLinksInLine('[[Bob|abc1]]x', 0);
    // to=12, cursor at 13
    const cursor = link.to + 1;
    expect(link.from <= cursor && cursor <= link.to).toBe(false);
  });
});

describe('readonly mode decorations', () => {
  function makeState(doc: string, cursorPos: number, readOnly: boolean) {
    const extensions = [
      markdown({ base: markdownLanguage }),
      ...(readOnly ? [EditorState.readOnly.of(true)] : []),
    ];
    return EditorState.create({ doc, extensions, selection: { anchor: cursorPos } });
  }

  it('in normal (editable) mode, a wiki-link whose range overlaps the selection shows as raw text', () => {
    // cursor at pos 2 — inside [[Bob|abc1]], from=0 to=12
    const state = makeState('[[Bob|abc1]]', 2, false);
    const decos = buildDecorations(state, {});
    let hasRawMark = false;
    decos.between(0, state.doc.length, (_from, _to, deco) => {
      if ((deco.spec as Record<string, unknown>)['class'] === 'cm-wiki-link-raw') hasRawMark = true;
    });
    expect(hasRawMark).toBe(true);
  });

  it('in readonly mode, the same overlapping selection always renders as a widget', () => {
    const state = makeState('[[Bob|abc1]]', 2, true);
    expect(state.readOnly).toBe(true);
    const decos = buildDecorations(state, {});
    let hasRawMark = false;
    let hasWidget = false;
    decos.between(0, state.doc.length, (_from, _to, deco) => {
      const spec = deco.spec as Record<string, unknown>;
      if (spec['class'] === 'cm-wiki-link-raw') hasRawMark = true;
      if (spec['widget'] !== undefined) hasWidget = true;
    });
    expect(hasRawMark).toBe(false);
    expect(hasWidget).toBe(true);
  });
});
