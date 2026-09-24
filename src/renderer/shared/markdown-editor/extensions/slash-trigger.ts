/**
 * Pure decision logic for whether typing `/` should open the editor's
 * context menu at the caret, instead of inserting a literal `/`.
 *
 * The menu opens only when `/` would start a new "word" — at the start of a
 * line or right after whitespace — and the caret isn't inside code (inline
 * or fenced), a wiki-link `[[...` query, or a URL/Link. This is what keeps
 * `and/or`, `1/2`, and `http://` from ever triggering it: the character
 * immediately before the caret in those cases is a letter, digit, colon, or
 * slash, never whitespace or start-of-line.
 */
import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

const BLOCKED_NODE_NAMES = new Set([
  'InlineCode',
  'FencedCode',
  'CodeBlock',
  'CodeText',
  'CodeMark',
  'URL',
  'Link',
]);

/** Inside an open `[[` query on the current line (no closing `]]` yet before `pos`). */
function isInsideWikiLinkQuery(state: EditorState, pos: number): boolean {
  const line = state.doc.lineAt(pos);
  const textBefore = line.text.slice(0, pos - line.from);
  const open = textBefore.lastIndexOf('[[');
  if (open === -1) return false;
  return !textBefore.slice(open + 2).includes(']]');
}

export function shouldOpenSlashMenu(state: EditorState, pos: number): boolean {
  const charBefore = pos > 0 ? state.doc.sliceString(pos - 1, pos) : '';
  const atBoundary = charBefore === '' || charBefore === ' ' || charBefore === '\t';
  if (!atBoundary) return false;

  if (isInsideWikiLinkQuery(state, pos)) return false;

  const tree = syntaxTree(state);
  let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(pos, -1);
  while (node) {
    if (BLOCKED_NODE_NAMES.has(node.name)) return false;
    node = node.parent;
  }

  return true;
}
