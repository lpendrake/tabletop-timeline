/**
 * Pure regex for detecting an open wiki-link query — shared by the wiki-link
 * completion source (`wiki-links.ts`) and the slash-menu trigger
 * (`slash-trigger.ts`) so the two can't drift out of sync.
 *
 * Matches `[[query` or `@query` running to the end of the given text (i.e.
 * an unterminated `[[` or `@` trigger with no `]`, newline, `|`, or `@`
 * after it).
 */
export const WIKI_LINK_QUERY_RE = /(?:\[\[|@)[^\]\n|@]*$/;

/** True when `textBeforeCaret` ends inside an open `[[` or `@` link query. */
export function isInWikiLinkQuery(textBeforeCaret: string): boolean {
  return WIKI_LINK_QUERY_RE.test(textBeforeCaret);
}
