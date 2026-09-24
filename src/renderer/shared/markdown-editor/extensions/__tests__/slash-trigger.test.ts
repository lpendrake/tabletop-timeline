import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { shouldOpenSlashMenu } from '../slash-trigger';

function makeState(doc: string) {
  const state = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });
  // Force the syntax tree to be fully parsed synchronously for the test.
  ensureSyntaxTree(state, state.doc.length);
  return state;
}

describe('shouldOpenSlashMenu', () => {
  it('opens at the start of a line', () => {
    const state = makeState('');
    expect(shouldOpenSlashMenu(state, 0)).toBe(true);
  });

  it('opens after a space', () => {
    const state = makeState('hello ');
    expect(shouldOpenSlashMenu(state, state.doc.length)).toBe(true);
  });

  it('opens at the start of a later line', () => {
    const state = makeState('first\n');
    expect(shouldOpenSlashMenu(state, state.doc.length)).toBe(true);
  });

  it('opens at the start of an empty line between paragraphs', () => {
    const state = makeState('first\n\nsecond');
    const emptyLine = state.doc.line(2);
    expect(shouldOpenSlashMenu(state, emptyLine.from)).toBe(true);
  });

  it('opens after a list marker and a blockquote marker', () => {
    const listItem = makeState('- ');
    expect(shouldOpenSlashMenu(listItem, listItem.doc.length)).toBe(true);

    const blockquote = makeState('> ');
    expect(shouldOpenSlashMenu(blockquote, blockquote.doc.length)).toBe(true);
  });

  it('opens on the line after a closed fenced code block, not inside one', () => {
    const afterFence = makeState('```\ncode\n```\n');
    expect(shouldOpenSlashMenu(afterFence, afterFence.doc.length)).toBe(true);

    const insideFence = makeState('```\n\ncode\n```');
    const emptyLineInFence = insideFence.doc.line(2);
    expect(shouldOpenSlashMenu(insideFence, emptyLineInFence.from)).toBe(false);
  });

  it('does not open in and/or or 1/2', () => {
    const andOr = makeState('and');
    expect(shouldOpenSlashMenu(andOr, andOr.doc.length)).toBe(false);

    const fraction = makeState('1');
    expect(shouldOpenSlashMenu(fraction, fraction.doc.length)).toBe(false);
  });

  it('does not open after a URL scheme', () => {
    const scheme = makeState('http:');
    expect(shouldOpenSlashMenu(scheme, scheme.doc.length)).toBe(false);

    const schemeSlash = makeState('http:/');
    expect(shouldOpenSlashMenu(schemeSlash, schemeSlash.doc.length)).toBe(false);
  });

  it('does not open inside inline code', () => {
    const state = makeState('`a `');
    // Position right after "a " and before the closing backtick — inside InlineCode.
    const pos = state.doc.toString().indexOf(' `') + 1;
    expect(shouldOpenSlashMenu(state, pos)).toBe(false);
  });

  it('does not open inside a fenced code block', () => {
    const state = makeState('```\na \n```');
    const pos = state.doc.toString().indexOf('a ') + 2;
    expect(shouldOpenSlashMenu(state, pos)).toBe(false);
  });
});
