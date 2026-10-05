export interface TooltipPosition {
  left: number;
  bottom: number;
}

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 6;

/**
 * Places a tooltip of width `maxWidth` just above `anchor` (its bottom edge `ANCHOR_GAP` px above
 * `anchor.top`), left-aligned to `anchor.left` and clamped to keep a margin inside the viewport. Pure.
 */
export function computeTooltipPosition(
  anchor: { left: number; top: number },
  viewportWidth: number,
  viewportHeight: number,
  maxWidth: number,
): TooltipPosition {
  let left = anchor.left;
  if (left + maxWidth > viewportWidth - VIEWPORT_MARGIN) {
    left = viewportWidth - maxWidth - VIEWPORT_MARGIN;
  }
  if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
  return { left, bottom: viewportHeight - anchor.top + ANCHOR_GAP };
}
