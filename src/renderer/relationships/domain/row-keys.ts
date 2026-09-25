/**
 * Composite, globally-unique keys for the collapse/expand state of outer and
 * inner rows. `OuterRow.key`/`InnerRow.key` are just the entity id (see
 * `group-relationships.ts`), which is only unique among *siblings* — the
 * same entity id can appear as an inner row under several different outer
 * rows, and switching grouping mode reuses the same ids in a different
 * shape. These helpers scope a row to its mode and ancestry so expand state
 * for one row never leaks onto an unrelated one. `TrackRow.key` is already
 * mode-independent and globally unique by construction, so it's used as-is.
 */

import type { GroupingMode, InnerRow, OuterRow } from './group-relationships';

export function outerRowStateKey(mode: GroupingMode, outer: OuterRow): string {
  return `${mode}|${outer.key}`;
}

export function innerRowStateKey(mode: GroupingMode, outer: OuterRow, inner: InnerRow): string {
  return `${mode}|${outer.key}|${inner.key}`;
}
