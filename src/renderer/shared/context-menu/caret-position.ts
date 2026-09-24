import type { Rect, Size } from './submenu-position';

/**
 * Pure geometry for placing a popup (e.g. a slash-command menu) relative to
 * the text caret's line, rather than relative to a menu row.
 *
 * The caller computes placement ONCE, when the popup opens, from the line's
 * rect and the popup's size at that moment. Later height changes (e.g. the
 * list growing as the user types) do NOT re-run this function — that's why
 * the 'above' side anchors with a CSS `bottom` distance instead of a `top`:
 * the popup's bottom edge stays pinned next to the line as its top edge
 * grows upward, without needing to recompute anything.
 */

/** Which side of the line the popup opened on. */
export type CaretSide = 'below' | 'above';

export interface CaretPlacement {
  left: number;
  /** Set when `side` is 'below': the popup's top edge, in viewport coordinates. */
  top?: number;
  /** Set when `side` is 'above': the popup's `bottom` CSS distance from the viewport's bottom edge. */
  bottom?: number;
  side: CaretSide;
  /** Space available on the chosen side (minus margins), for capping growth. */
  maxHeight: number;
}

/** Minimum gap kept between the popup and the edge of the viewport. */
const EDGE_MARGIN = 8;

/** Gap kept between the popup and the line it's anchored to. */
const GAP = 2;

/**
 * Computes where a caret-anchored popup should open given the rect of the
 * line it's anchored to, the popup's own (measured) size, and the viewport.
 *
 * Tries `prefer` first; if the popup fits there (within EDGE_MARGIN of the
 * viewport edge) it's used. Otherwise the other side is tried. If neither
 * side has room, the side with more available space is used as a best fit,
 * clamped to stay fully within the viewport — which may mean the popup
 * overlaps the line, but only when nothing else fits.
 */
export function computeCaretPlacement(
  lineRect: Rect,
  popupSize: Size,
  viewport: Size,
  prefer: CaretSide,
): CaretPlacement {
  const below = belowSpace(lineRect, viewport);
  const above = aboveSpace(lineRect, viewport);
  const belowFits = popupSize.height <= below.maxHeight;
  const aboveFits = popupSize.height <= above.maxHeight;

  let side: CaretSide;
  if (prefer === 'below') {
    side = belowFits
      ? 'below'
      : aboveFits
        ? 'above'
        : below.maxHeight >= above.maxHeight
          ? 'below'
          : 'above';
  } else {
    side = aboveFits
      ? 'above'
      : belowFits
        ? 'below'
        : above.maxHeight >= below.maxHeight
          ? 'above'
          : 'below';
  }

  const left = clampLeft(lineRect.left, popupSize.width, viewport);

  if (side === 'below') {
    let top = below.top;
    if (!belowFits) {
      top = Math.min(top, viewport.height - EDGE_MARGIN - popupSize.height);
      top = Math.max(top, EDGE_MARGIN);
    }
    return { left, top, side, maxHeight: below.maxHeight };
  }

  let bottom = above.bottom;
  if (!aboveFits) {
    bottom = Math.min(bottom, viewport.height - EDGE_MARGIN - popupSize.height);
    bottom = Math.max(bottom, EDGE_MARGIN);
  }
  return { left, bottom, side, maxHeight: above.maxHeight };
}

function belowSpace(lineRect: Rect, viewport: Size): { top: number; maxHeight: number } {
  const top = lineRect.bottom + GAP;
  return { top, maxHeight: Math.max(0, viewport.height - EDGE_MARGIN - top) };
}

function aboveSpace(lineRect: Rect, viewport: Size): { bottom: number; maxHeight: number } {
  const bottom = viewport.height - lineRect.top + GAP;
  return { bottom, maxHeight: Math.max(0, lineRect.top - GAP - EDGE_MARGIN) };
}

function clampLeft(caretX: number, popupWidth: number, viewport: Size): number {
  const max = viewport.width - popupWidth - EDGE_MARGIN;
  return Math.max(EDGE_MARGIN, Math.min(caretX, max));
}
