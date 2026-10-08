/**
 * Presentation model of the numeric Relationships tab: per-row text, tooltips and
 * plot geometry against one shared axis. Pure — no IO, no React.
 */
import { startingValue, type NumericTrack } from '../../../shared/relationships';
import {
  deltaTone,
  formatDeltaChange,
  formatLastChange,
  formatNumber,
  formatSigned,
  SEPARATOR,
  type ChangeTone,
} from './row-display';
import {
  lineBetween,
  plotScale,
  valueFraction,
  type PlotRange,
  type PlotScale,
} from './plot-scale';
import type { ViewGroup, ViewRow } from './view-rows';

export interface NumericRowModel {
  valueText: string;
  /** Null when the track has no bands. */
  bandLabel: string | null;
  colour: string;
  /** `text` is the amount and date as one string, for hover titles. */
  lastChange: { amount: string; tone: ChangeTone; dateLabel: string; text: string } | null;
  entryCount: number;
  /** Fractions of the axis, spanning the track's initial value to the current one. */
  line: { left: number; width: number };
  /** Fraction of the axis at the current value. */
  dot: number;
  lineTooltip: string;
  dotTooltip: string;
}

/** The part of a row's plot a tooltip describes. */
export type PlotPart = 'line' | 'dot';

export function tooltipText(model: NumericRowModel, part: PlotPart): string {
  return part === 'line' ? model.lineTooltip : model.dotTooltip;
}

export interface NumericTabModel {
  scale: PlotScale;
  /** Keyed by `ViewRow.key`. */
  rows: ReadonlyMap<string, NumericRowModel>;
}

type NumericRowSource = Pick<
  ViewRow,
  'value' | 'stateLabel' | 'colour' | 'lastChange' | 'entryCount'
>;

export function numericRowModel(
  row: NumericRowSource,
  track: NumericTrack,
  range: PlotRange,
  asOfLabel: string | null,
): NumericRowModel {
  const value = Number(row.value);
  const start = Number(startingValue(track));
  const valueText = formatNumber(value);
  const summary = row.stateLabel === null ? valueText : `${valueText}${SEPARATOR}${row.stateLabel}`;
  const dot = valueFraction(range, value);
  return {
    valueText,
    bandLabel: row.stateLabel,
    colour: row.colour,
    lastChange: row.lastChange
      ? {
          amount: formatDeltaChange(row.lastChange.delta),
          tone: deltaTone(row.lastChange.delta),
          dateLabel: row.lastChange.dateLabel,
          text: formatLastChange(row.lastChange),
        }
      : null,
    entryCount: row.entryCount,
    line: lineBetween(range, start, value),
    dot,
    lineTooltip: `${summary} (${formatSigned(value - start)} from ${formatNumber(start)})`,
    dotTooltip: asOfLabel === null ? summary : `${summary} as of ${asOfLabel}`,
  };
}

/** A row's current value, plus its history's running values when it is expanded. */
function plotValues(row: ViewRow): number[] {
  return [Number(row.value), ...(row.history ?? []).map((entry) => Number(entry.runningValue))];
}

/**
 * The axis and every row's model. The axis covers collapsed groups too, so it stays put
 * when one is toggled, and widens (on unbounded tracks) to fit expanded rows' history.
 */
export function numericTabModel(
  track: NumericTrack,
  groups: readonly ViewGroup[],
  asOfLabel: string | null,
): NumericTabModel {
  const rows = groups.flatMap((group) => group.rows);
  const scale = plotScale(track, rows.flatMap(plotValues));
  return {
    scale,
    rows: new Map(rows.map((row) => [row.key, numericRowModel(row, track, scale, asOfLabel)])),
  };
}
