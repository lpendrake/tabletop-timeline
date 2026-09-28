/**
 * Keys for the collapse/expand state of outer and inner rows, scoped to
 * ancestry so expand state for one row never leaks onto an unrelated one.
 * `OuterRow.key`/`InnerRow.key` are just the entity id (see
 * `group-relationships.ts`) — unique among *siblings* only, since the same
 * entity id can appear as an inner row under several different outer rows.
 * Mode scoping is handled by the caller storing expand state per mode (see
 * `Record<GroupingMode, Set<string>>` in `use-relationships.ts`), so these
 * keys no longer need a mode prefix. `TrackRow.key` is already
 * mode-independent and globally unique by construction, so it's used as-is.
 */

import type { InnerRow, OuterRow } from './group-relationships';

export function outerRowStateKey(outer: OuterRow): string {
  return outer.key;
}

export function innerRowStateKey(outer: OuterRow, inner: InnerRow): string {
  return `${outer.key}|${inner.key}`;
}
