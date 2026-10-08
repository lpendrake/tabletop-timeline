import { createPortal } from 'react-dom';
import { TOOLTIP_MAX_WIDTH, type PlotTooltip } from '../../hooks/use-plot-tooltip';

/** The hover tooltip of a plot, or nothing while no target is hovered. */
export function PlotTooltipPortal<Target>({
  tooltip,
  text,
}: {
  tooltip: PlotTooltip<Target> | null;
  text: (target: Target) => string;
}) {
  if (!tooltip) return null;
  // In the body so a faded row or a transformed ancestor cannot dim or displace it.
  return createPortal(
    <div className="rel-num-tooltip" style={{ ...tooltip.position, maxWidth: TOOLTIP_MAX_WIDTH }}>
      {text(tooltip.target)}
    </div>,
    document.body,
  );
}
