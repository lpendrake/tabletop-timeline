import { useState } from 'react';
import type { MouseEvent } from 'react';
import { computeTooltipPosition } from '../../shared/tooltip-position';
import type { PlotPart } from '../domain/numeric-rows';

export const TOOLTIP_MAX_WIDTH = 240;

export interface PlotTooltip {
  part: PlotPart;
  left: number;
  bottom: number;
}

/**
 * Hover state for one plot: `hoverProps(part)` follows the pointer, `tooltip` is null while
 * nothing is hovered. It holds which part is hovered, not its text, so the caller reads the
 * text from current data.
 */
export function usePlotTooltip() {
  const [tooltip, setTooltip] = useState<PlotTooltip | null>(null);
  const hoverProps = (part: PlotPart) => ({
    onMouseMove: (e: MouseEvent) =>
      setTooltip({
        part,
        ...computeTooltipPosition(
          { left: e.clientX, top: e.clientY },
          window.innerWidth,
          window.innerHeight,
          TOOLTIP_MAX_WIDTH,
        ),
      }),
    onMouseLeave: () => setTooltip(null),
  });
  return { tooltip, hoverProps };
}
