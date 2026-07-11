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

/** Which side of the parent row the panel actually opened on. */
export type SubmenuSide = 'left' | 'right';

export interface SubmenuPosition extends Point {
  side: SubmenuSide;
}

/** Minimum gap kept between a panel and the edge of the viewport. */
const EDGE_MARGIN = 8;

/**
 * Computes where a submenu panel should be placed given the rect of the row
 * that opened it, the panel's own (measured) size, and the viewport size.
 *
 * Default placement (preferLeft falsy) is to the right of the parent row,
 * top-aligned with it, flipping to the left of the row when it would
 * overflow the right edge.
 *
 * When `preferLeft` is true, the panel opens to the LEFT of the parent row
 * first, falling back to the right only if that would overflow the left
 * edge. This lets a chain of nested submenus inherit the open direction of
 * an ancestor that already flipped left near the right screen edge, instead
 * of each level independently re-trying the right side and collapsing
 * toward the edge.
 *
 * Always shifts up when the panel would overflow the bottom edge, and
 * clamps the final point on-screen either way.
 */
export function computeSubmenuPosition(
  parentRect: Rect,
  panelSize: Size,
  viewport: Size,
  preferLeft?: boolean,
): SubmenuPosition {
  let x: number;
  let side: SubmenuSide;

  if (preferLeft) {
    const leftX = parentRect.left - panelSize.width;
    if (leftX >= EDGE_MARGIN) {
      x = leftX;
      side = 'left';
    } else {
      x = parentRect.right;
      side = 'right';
    }
  } else {
    x = parentRect.right;
    side = 'right';
    if (x + panelSize.width > viewport.width - EDGE_MARGIN) {
      x = parentRect.left - panelSize.width;
      side = 'left';
    }
  }
  x = Math.max(EDGE_MARGIN, Math.min(x, viewport.width - panelSize.width - EDGE_MARGIN));

  let y = parentRect.top;
  if (y + panelSize.height > viewport.height - EDGE_MARGIN) {
    y = viewport.height - panelSize.height - EDGE_MARGIN;
  }
  y = Math.max(EDGE_MARGIN, y);

  return { x, y, side };
}
