import { tooltipText, type NumericRowModel, type PlotPart } from '../../domain/numeric-rows';
import { percent, type PlotScale } from '../../domain/plot-scale';
import { usePlotTooltip } from '../../hooks/use-plot-tooltip';
import { PlotBackground } from './plot-background';
import { PlotTooltipPortal } from './plot-tooltip';

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
  const { tooltip, hoverProps } = usePlotTooltip<PlotPart>();
  return (
    <div className="rel-num-plot">
      <div className="rel-num-layer">
        <PlotBackground scale={scale} />
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
      <PlotTooltipPortal tooltip={tooltip} text={(part) => tooltipText(model, part)} />
    </div>
  );
}
