import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { isCaretMenuTrigger } from '../slash-trigger';
import { embeddedRanges } from '../embedded-ranges';

function makeState(doc: string) {
  const state = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });
  // Force the syntax tree to be fully parsed synchronously for the test.
  ensureSyntaxTree(state, state.doc.length);
  return state;
}

describe('isCaretMenuTrigger', () => {
  it('opens at the start of a line', () => {
    const state = makeState('');
    expect(isCaretMenuTrigger(state, 0)).toBe(true);
  });

  it('slash menu is blocked inside an embedded range and opens just after it', () => {
    const embedded = '<<block with a space >>';
    const extensions = [
      markdown({ base: markdownLanguage }),
      embeddedRanges.of(() => [{ from: 0, to: embedded.length }]),
    ];
    const inside = EditorState.create({ doc: `${embedded} `, extensions });
    ensureSyntaxTree(inside, inside.doc.length);
    expect(isCaretMenuTrigger(inside, embedded.indexOf('space ') + 6)).toBe(false);
    expect(isCaretMenuTrigger(inside, inside.doc.length)).toBe(true);
  });

  it('opens after a space', () => {
    const state = makeState('hello ');
    expect(isCaretMenuTrigger(state, state.doc.length)).toBe(true);
  });

  it('opens at the start of a later line', () => {
    const state = makeState('first\n');
    expect(isCaretMenuTrigger(state, state.doc.length)).toBe(true);
  });

  it('opens at the start of an empty line between paragraphs', () => {
    const state = makeState('first\n\nsecond');
    const emptyLine = state.doc.line(2);
    expect(isCaretMenuTrigger(state, emptyLine.from)).toBe(true);
  });

  it('opens after a list marker and a blockquote marker', () => {
    const listItem = makeState('- ');
    expect(isCaretMenuTrigger(listItem, listItem.doc.length)).toBe(true);

    const blockquote = makeState('> ');
    expect(isCaretMenuTrigger(blockquote, blockquote.doc.length)).toBe(true);
  });

  it('opens on the line after a closed fenced code block, not inside one', () => {
    const afterFence = makeState('```\ncode\n```\n');
    expect(isCaretMenuTrigger(afterFence, afterFence.doc.length)).toBe(true);

    const insideFence = makeState('```\n\ncode\n```');
    const emptyLineInFence = insideFence.doc.line(2);
    expect(isCaretMenuTrigger(insideFence, emptyLineInFence.from)).toBe(false);
  });

  it('does not open in and/or or 1/2', () => {
    const andOr = makeState('and');
    expect(isCaretMenuTrigger(andOr, andOr.doc.length)).toBe(false);

    const fraction = makeState('1');
    expect(isCaretMenuTrigger(fraction, fraction.doc.length)).toBe(false);
  });

  it('does not open after a URL scheme', () => {
    const scheme = makeState('http:');
    expect(isCaretMenuTrigger(scheme, scheme.doc.length)).toBe(false);

    const schemeSlash = makeState('http:/');
    expect(isCaretMenuTrigger(schemeSlash, schemeSlash.doc.length)).toBe(false);
  });

  it('does not open inside inline code', () => {
    const state = makeState('`a `');
    // Position right after "a " and before the closing backtick — inside InlineCode.
    const pos = state.doc.toString().indexOf(' `') + 1;
    expect(isCaretMenuTrigger(state, pos)).toBe(false);
  });

  it('does not open inside a fenced code block', () => {
    const state = makeState('```\na \n```');
    const pos = state.doc.toString().indexOf('a ') + 2;
    expect(isCaretMenuTrigger(state, pos)).toBe(false);
  });

  it('an open `[[` query still blocks `/` until `]]`', () => {
    const open = makeState('[[cap ');
    expect(isCaretMenuTrigger(open, open.doc.length)).toBe(false);
    const closed = makeState('[[abcd]] ');
    expect(isCaretMenuTrigger(closed, closed.doc.length)).toBe(true);
  });

  it('an email address earlier on the line is not a link query', () => {
    const state = makeState('me@example.com ');
    expect(isCaretMenuTrigger(state, state.doc.length)).toBe(true);
  });

  it('`@` followed by a space is not a link query', () => {
    const state = makeState('Meet @ the inn ');
    expect(isCaretMenuTrigger(state, state.doc.length)).toBe(true);
  });

  it('an `@` several words back does not block `/`', () => {
    const state = makeState('see @ the old inn and then ');
    expect(isCaretMenuTrigger(state, state.doc.length)).toBe(true);
  });

  it('opens after a completed link', () => {
    const closedBrackets = makeState('[[abcd]] ');
    expect(isCaretMenuTrigger(closedBrackets, closedBrackets.doc.length)).toBe(true);
  });
});
