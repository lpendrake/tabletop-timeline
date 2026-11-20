/**
 * Pure decision logic for whether a typed trigger character should open a
 * caret-anchored menu (such as the editor's `/` context menu) instead of
 * inserting a literal character.
 *
 * The menu opens only when the character would start a new "word" — at the
 * start of its line (including an empty line, or the line right after a list
 * marker or blockquote marker's space) or right after whitespace — and the
 * caret isn't inside code (inline or fenced), an open wiki-link `[[...` query
 * (see `wiki-link-query.ts`), or a URL/Link. This is what keeps `and/or`,
 * `1/2`, and `http://` from ever triggering it: the character immediately
 * before the caret in those cases is a letter, digit, colon, or slash, never
 * whitespace or start-of-line. It never opens inside an embedded range (see
 * `embedded-ranges.ts`), whose text belongs to another syntax.
 */
import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { isInWikiLinkQuery } from './wiki-link-query';
import { embeddedRangesIn, isInsideEmbeddedRange } from './embedded-ranges';

const BLOCKED_NODE_NAMES = new Set([
  'InlineCode',
  'FencedCode',
  'CodeBlock',
  'CodeText',
  'CodeMark',
  'URL',
  'Link',
]);

export function isCaretMenuTrigger(state: EditorState, pos: number): boolean {
  const charBefore = pos > 0 ? state.doc.sliceString(pos - 1, pos) : '';
  const atLineStart = pos === state.doc.lineAt(pos).from;
  const atBoundary = atLineStart || charBefore === ' ' || charBefore === '\t';
  if (!atBoundary) return false;

  const line = state.doc.lineAt(pos);
  const textBefore = line.text.slice(0, pos - line.from);
  if (isInWikiLinkQuery(textBefore)) return false;
  // A `/` inside an embedded range is just text.
  if (isInsideEmbeddedRange(embeddedRangesIn(state), pos)) return false;

  const tree = syntaxTree(state);
  let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(pos, -1);
  while (node) {
    if (BLOCKED_NODE_NAMES.has(node.name)) return false;
    node = node.parent;
  }

  return true;
}
