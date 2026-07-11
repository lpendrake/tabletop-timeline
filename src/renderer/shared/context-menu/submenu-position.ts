/**
 * Pure geometry for placing a submenu panel next to the row that opened it.
 * No DOM access here — callers measure rects and pass plain numbers in.
 */

export interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Minimum gap kept between a panel and the edge of the viewport. */
const EDGE_MARGIN = 8;

/**
 * Computes where a submenu panel should be placed given the rect of the row
 * that opened it, the panel's own (measured) size, and the viewport size.
 *
 * Default placement is to the right of the parent row, top-aligned with it.
 * Flips to the left of the row when it would overflow the right edge, and
 * shifts up when it would overflow the bottom edge.
 */
export function computeSubmenuPosition(parentRect: Rect, panelSize: Size, viewport: Size): Point {
  let x = parentRect.right;
  if (x + panelSize.width > viewport.width - EDGE_MARGIN) {
    x = parentRect.left - panelSize.width;
  }
  x = Math.max(EDGE_MARGIN, Math.min(x, viewport.width - panelSize.width - EDGE_MARGIN));

  let y = parentRect.top;
  if (y + panelSize.height > viewport.height - EDGE_MARGIN) {
    y = viewport.height - panelSize.height - EDGE_MARGIN;
  }
  y = Math.max(EDGE_MARGIN, y);

  return { x, y };
}
