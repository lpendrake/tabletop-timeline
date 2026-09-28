/**
 * Applies a loaded `ViewOrderModeState` on top of the alphabetically-grouped
 * rows `groupRelationships` produces: outer rows are reordered by the ""
 * (top-level) entry, and each outer row's children are reordered by the
 * entry keyed on that outer row's id. Track order is never touched here —
 * tracks stay ordered by the track library via `compareTrackRows`. Pure —
 * no IO, no React.
 */

import { applyOrder, TOP_LEVEL_PARENT_KEY } from './view-order';
import { compareEntitiesByLabel, type OuterRow } from './group-relationships';

/**
 * `orderByParentKey` is one mode's sparse order map (`ViewOrderModeState.order`):
 * `""` for the top level, an outer row's id for its children.
 */
export function applyViewOrderToRows(
  rows: readonly OuterRow[],
  orderByParentKey: Record<string, string[]>,
  labelFor: (id: string) => string,
): OuterRow[] {
  const compare = (a: string, b: string) => compareEntitiesByLabel(labelFor, a, b);

  const outerById = new Map(rows.map((row) => [row.key, row]));
  const orderedOuterIds = applyOrder(
    rows.map((row) => row.key),
    orderByParentKey[TOP_LEVEL_PARENT_KEY],
    compare,
  );

  return orderedOuterIds.map((outerId) => {
    const row = outerById.get(outerId)!;
    const innerById = new Map(row.children.map((inner) => [inner.key, inner]));
    const orderedInnerIds = applyOrder(
      row.children.map((inner) => inner.key),
      orderByParentKey[row.key],
      compare,
    );
    return { ...row, children: orderedInnerIds.map((innerId) => innerById.get(innerId)!) };
  });
}
