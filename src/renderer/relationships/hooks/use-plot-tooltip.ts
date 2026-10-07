import { useState } from 'react';
import type { MouseEvent } from 'react';
import { computeTooltipPosition, type TooltipPosition } from '../../shared/tooltip-position';

export const TOOLTIP_MAX_WIDTH = 240;

export interface PlotTooltip<Target> {
  target: Target;
  position: TooltipPosition;
}

export interface PlotHoverProps {
  onMouseMove: (e: MouseEvent) => void;
  onMouseLeave: () => void;
}

/**
 * Hover state for one plot: `hoverProps(target)` follows the pointer, `tooltip` is null while
 * nothing is hovered. The target is whatever the caller wants back: a row's plot passes the
 * part hovered and reads its text from current data, a history passes the tooltip text itself.
 */
export function usePlotTooltip<Target>() {
  const [tooltip, setTooltip] = useState<PlotTooltip<Target> | null>(null);
  const hoverProps = (target: Target): PlotHoverProps => ({
    onMouseMove: (e: MouseEvent) =>
      setTooltip({
        target,
        position: computeTooltipPosition(
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
