/** Fixed-position offsets: `left` or `right` locates the horizontal edge pinned to the pointer, `bottom` the bottom edge. */
export type TooltipPosition = { left: number; bottom: number } | { right: number; bottom: number };

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 6;

/**
 * Places a tooltip of at most `maxWidth` just above `anchor` (its bottom edge `ANCHOR_GAP` px above
 * `anchor.top`). Its left edge sits at `anchor.left`; when a `maxWidth`-wide tooltip would not fit
 * before the right viewport edge, its right edge sits at `anchor.left` instead, so a narrower
 * tooltip still ends at the pointer. Either offset keeps a margin inside the viewport. Pure.
 */
export function computeTooltipPosition(
  anchor: { left: number; top: number },
  viewportWidth: number,
  viewportHeight: number,
  maxWidth: number,
): TooltipPosition {
  const bottom = viewportHeight - anchor.top + ANCHOR_GAP;
  if (anchor.left + maxWidth > viewportWidth - VIEWPORT_MARGIN) {
    return { right: Math.max(viewportWidth - anchor.left, VIEWPORT_MARGIN), bottom };
  }
  return { left: Math.max(anchor.left, VIEWPORT_MARGIN), bottom };
}
