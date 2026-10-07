import { percent, type PlotScale } from '../../domain/plot-scale';
import { cssVars } from '../../../shared/css-vars';

/** The bands or gridlines and the zero line behind a row's line and dot, drawn into a `rel-num-layer`. */
export function PlotBackground({ scale }: { scale: PlotScale }) {
  return (
    <>
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
    </>
  );
}
