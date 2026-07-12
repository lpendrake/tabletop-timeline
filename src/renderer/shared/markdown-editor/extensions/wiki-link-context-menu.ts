import type { ParsedWikiLink } from './wiki-links';

/** A CodeMirror-style change range: replace [from, to) with insert. */
export interface LabelChange {
  from: number;
  to: number;
  insert: string;
}

/**
 * Insert-or-replace the local label so the link reads `[[displayLabel|id]]`.
 * - `[[id]]` -> `[[displayLabel|id]]`: insert "displayLabel|" right after "[[".
 * - `[[Old|id]]` -> `[[displayLabel|id]]`: replace just the label span.
 */
export function overrideLocalLabelChange(link: ParsedWikiLink, displayLabel: string): LabelChange {
  if (link.labelFrom === null || link.labelTo === null) {
    return { from: link.from + 2, to: link.from + 2, insert: `${displayLabel}|` };
  }
  return { from: link.labelFrom, to: link.labelTo, insert: displayLabel };
}

/**
 * Strip "label|" so the link reads `[[id]]`. Returns null when the link has
 * no local label (nothing to reset).
 */
export function resetLocalLabelChange(link: ParsedWikiLink): LabelChange | null {
  if (link.labelFrom === null || link.labelTo === null) return null;
  return { from: link.labelFrom, to: link.labelTo + 1, insert: '' };
}

/** Resolved display label chain: local label, then entity index, then raw id. */
export function resolveDisplayLabel(
  link: ParsedWikiLink,
  entityLabelMap: Map<string, string>,
): string {
  return link.label || entityLabelMap.get(link.id) || link.id;
}

/** True when the entity index has an override label for `id` that differs from the id itself. */
export function hasGlobalOverride(id: string, entityLabelMap: Map<string, string>): boolean {
  return entityLabelMap.has(id) && entityLabelMap.get(id) !== id;
}
