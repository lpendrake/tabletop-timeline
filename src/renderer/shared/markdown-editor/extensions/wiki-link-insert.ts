/**
 * Pure helpers shared by the `[[` completion (`wiki-links.ts`) and the `@`
 * link search (`at-link-menu.ts`) for inserting a link to a suggestion.
 */

export interface WikiLinkSuggestion {
  id: string;
  label: string;
  detail?: string;
  boost?: number;
  /** Present for image assets — causes insertion of ![label](notes-asset://...) instead of [[label|id]] */
  assetPath?: string;
}

export interface WikiLinkApplyResult {
  insert: string;
  replaceFrom: number;
  replaceTo: number;
}

/**
 * Builds the text and replacement range for inserting a link to `s`.
 * `replaceFrom`/`replaceTo` is the range to overwrite: the `[[query` for
 * completion, or an empty range at the caret for a bare insert. `nextTwo` is
 * the two characters after `replaceTo`; a `]]` there is absorbed into the
 * replacement so an existing closing bracket pair is not duplicated.
 */
export function buildWikiLinkInsert(
  s: WikiLinkSuggestion,
  replaceFrom: number,
  replaceTo: number,
  nextTwo: string,
): WikiLinkApplyResult {
  if (s.assetPath) {
    return {
      insert: `![${s.label}](notes-asset://current/${s.assetPath})`,
      replaceFrom,
      replaceTo,
    };
  }
  return {
    insert: `[[${s.id}]]`,
    replaceFrom,
    replaceTo: nextTwo === ']]' ? replaceTo + 2 : replaceTo,
  };
}
