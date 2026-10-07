import { Fragment, useMemo, useState } from 'react';
import type { EntityIndexEntry } from '../../../../types/global';
import type { NumericTrack } from '../../../../shared/relationships';
import { entryYear } from '../../domain/entry-date';
import { isYearOpen, withToggledYear } from '../../domain/history-years';
import { numericHistoryModel } from '../../domain/numeric-history';
import { openDeclaringFile } from '../../domain/step-open-target';
import type { ChangeTone } from '../../domain/row-display';
import { percent, type PlotScale } from '../../domain/plot-scale';
import type { HistoryEntry } from '../../domain/view-rows';
import { usePlotTooltip, type PlotHoverProps } from '../../hooks/use-plot-tooltip';
import { cssVars } from '../../../shared/css-vars';
import { HighlightText } from '../highlight-text';
import { PlotBackground } from './plot-background';
import { PlotTooltipPortal } from './plot-tooltip';

export interface NumericHistoryProps {
  history: readonly HistoryEntry[];
  track: NumericTrack;
  scale: PlotScale;
  now: number;
  query: string;
  entityIndex: readonly EntityIndexEntry[] | null;
  onOpenEvent: (filename: string) => void;
  onOpenById: (id: string) => void;
}

interface HistoryPlotProps {
  scale: PlotScale;
  line: { left: number; width: number };
  dot: number;
  hover: (tooltip: string) => PlotHoverProps;
  tooltip: string;
}

/** A segment and a dot on the shared axis, in the same inset layer and with the same backgrounds as a row's plot. */
function HistoryPlot({ scale, line, dot, hover, tooltip }: HistoryPlotProps) {
  return (
    <div className="rel-num-plot">
      <div className="rel-num-layer">
        <PlotBackground scale={scale} />
        <div
          className="rel-num-line"
          style={{ left: percent(line.left), width: percent(line.width) }}
          {...hover(tooltip)}
        >
          <div className="rel-num-line-fill" />
        </div>
        <div className="rel-num-dot-hit" style={{ left: percent(dot) }} {...hover(tooltip)}>
          <div className="rel-num-dot" />
        </div>
      </div>
    </div>
  );
}

const toneClass = (tone: ChangeTone) => `rel-num-amount is-${tone}`;

/**
 * An expanded row's change history, inline below it: one group per in-game year with its
 * entries, plotted on the same axis as the rows above.
 */
export function NumericHistory(props: NumericHistoryProps) {
  const { history, track, scale, now, query, entityIndex, onOpenEvent, onOpenById } = props;
  const years = useMemo(
    () => numericHistoryModel(history, { track, range: scale, now, yearOf: entryYear }),
    [history, track, scale, now],
  );
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(new Map());
  const { tooltip, hoverProps } = usePlotTooltip<string>();
  return (
    <div className="rel-num-history">
      {years.map((year) => {
        const open = isYearOpen(year.year, overrides);
        return (
          <Fragment key={year.year.key}>
            <div className="rel-num-year" style={cssVars({ '--rel-num-colour': year.colour })}>
              <div className="rel-num-left rel-num-history-left">
                <button
                  type="button"
                  className="rel-num-year-toggle"
                  aria-expanded={open}
                  onClick={() => setOverrides(withToggledYear(overrides, year.year))}
                >
                  <span aria-hidden="true">{open ? '▾' : '▸'}</span>
                  <span className="rel-num-year-label">{year.label}</span>
                  <span className="rel-num-year-count">{year.countText}</span>
                  <span className={toneClass(year.netTone)}>{year.changeText}</span>
                  {year.matchText && <span className="rel-num-year-match">{year.matchText}</span>}
                </button>
              </div>
              <HistoryPlot
                scale={scale}
                line={year.line}
                dot={year.dot}
                hover={hoverProps}
                tooltip={year.tooltip}
              />
            </div>
            {open &&
              year.entries.map((entry) => (
                <div
                  key={entry.key}
                  className={entry.classes}
                  style={cssVars({ '--rel-num-colour': entry.colour })}
                >
                  <div className="rel-num-left rel-num-history-left">
                    <div className="rel-num-entry-grid">
                      <span className="rel-num-entry-date">{entry.dateLabel}</span>
                      <button
                        type="button"
                        className="rel-num-entry-link"
                        onClick={() =>
                          openDeclaringFile(entry.path, entityIndex ?? [], {
                            event: onOpenEvent,
                            note: onOpenById,
                          })
                        }
                      >
                        <HighlightText text={entry.linkLabel} query={query} />
                      </button>
                      <span
                        className="rel-num-entry-reason"
                        {...(entry.reason ? hoverProps(entry.reason) : {})}
                      >
                        <HighlightText text={entry.reason} query={query} />
                      </span>
                      <span className={`rel-num-entry-amount ${toneClass(entry.tone)}`}>
                        {entry.amount}
                      </span>
                      <span className="rel-num-entry-running">{entry.runningText}</span>
                    </div>
                  </div>
                  <HistoryPlot
                    scale={scale}
                    line={entry.line}
                    dot={entry.dot}
                    hover={hoverProps}
                    tooltip={entry.tooltip}
                  />
                </div>
              ))}
          </Fragment>
        );
      })}
      <PlotTooltipPortal tooltip={tooltip} text={(text) => text} />
    </div>
  );
}
