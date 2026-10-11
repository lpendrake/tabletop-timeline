import type { CSSProperties } from 'react';
import type { CaretPlacement } from './caret-position';

/** Fixed-position style for a popup placed by `computeCaretPlacement`. */
export function placementStyle(placement: CaretPlacement): CSSProperties {
  return {
    left: placement.left,
    top: placement.top,
    bottom: placement.bottom,
    maxHeight: placement.maxHeight,
  };
}
