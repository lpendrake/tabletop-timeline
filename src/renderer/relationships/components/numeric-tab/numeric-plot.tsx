import { createPortal } from 'react-dom';
import { tooltipText, type NumericRowModel } from '../../domain/numeric-rows';
import { percent, type PlotScale } from '../../domain/plot-scale';
import { TOOLTIP_MAX_WIDTH, usePlotTooltip } from '../../hooks/use-plot-tooltip';
import { cssVars } from '../../../shared/css-vars';

export interface NumericPlotProps {
  scale: PlotScale;
  model: NumericRowModel;
}

/**
 * One row's slice of the shared axis: bands or gridlines, the zero line, the initial → current
 * line and the current-value dot. They sit in a `rel-num-layer`, inset like the header's axis
 * so a dot at either end of the range stays inside the plot.
 */
export function NumericPlot({ scale, model }: NumericPlotProps) {
  const { tooltip, hoverProps } = usePlotTooltip();
  return (
    <div className="rel-num-plot">
      <div className="rel-num-layer">
        {scale.bands.map((span) => (
          <div
            key={span.key}
            className="rel-num-band"
            style={{
              left: percent(span.start),
              width: percent(span.end - span.start),
              ...cssVars({ '--rel-num-colour': span.colour }),
            }}
          />
        ))}
        {scale.ticks.map((tick) => (
          <div
            key={tick.value}
            className="rel-num-gridline"
            style={{ left: percent(tick.fraction) }}
          />
        ))}
        {scale.zero !== null && (
          <div className="rel-num-zero" style={{ left: percent(scale.zero) }} />
        )}
        <div
          className="rel-num-line"
          style={{ left: percent(model.line.left), width: percent(model.line.width) }}
          {...hoverProps('line')}
        >
          <div className="rel-num-line-fill" />
        </div>
        <div
          className="rel-num-dot-hit"
          style={{ left: percent(model.dot) }}
          {...hoverProps('dot')}
        >
          <div className="rel-num-dot" />
        </div>
      </div>
      {tooltip &&
        // In the body so a faded row or a transformed ancestor cannot dim or displace it.
        createPortal(
          <div
            className="rel-num-tooltip"
            style={{ ...tooltip.position, maxWidth: TOOLTIP_MAX_WIDTH }}
          >
            {tooltipText(model, tooltip.part)}
          </div>,
          document.body,
        )}
    </div>
  );
}
