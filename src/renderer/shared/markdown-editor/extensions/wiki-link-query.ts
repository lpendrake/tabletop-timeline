/**
 * Pure regex for detecting an open wiki-link query — shared by the wiki-link
 * completion source (`wiki-links.ts`) and the caret-menu trigger
 * (`slash-trigger.ts`) so the two can't drift out of sync.
 *
 * Matches `[[query` running to the end of the given text (i.e. an
 * unterminated `[[` with no `]`, newline, or `|` after it).
 */
export const WIKI_LINK_QUERY_RE = /\[\[[^\]\n|]*$/;

/** True when `textBeforeCaret` ends inside an open `[[` link query. */
export function isInWikiLinkQuery(textBeforeCaret: string): boolean {
  return WIKI_LINK_QUERY_RE.test(textBeforeCaret);
}
