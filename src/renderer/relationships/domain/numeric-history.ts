/**
 * Presentation model of an expanded numeric row's history, grouped by year:
 * text, tooltips and plot geometry against the tab's shared axis. Pure — no IO, no React.
 */
import type { NumericTrack } from '../../../shared/relationships';
import {
  groupHistoryByYear,
  yearCountLabel,
  yearLabel,
  yearMatchLabel,
  type HistoryYear,
  type YearOf,
} from './history-years';
import { lineBetween, valueFraction, type PlotRange } from './plot-scale';
import { scaleColourCss, valueColour } from './scale-colour';
import {
  deltaTone,
  formatNumber,
  formatSigned,
  historyEntryClasses,
  numberTone,
  SEPARATOR,
  type ChangeTone,
} from './row-display';
import type { HistoryEntry } from './view-rows';

const ARROW = ' → ';
const NOTE_LINK_LABEL = 'Note';
const SET_AMOUNT = 'set';

export interface NumericHistoryContext {
  track: NumericTrack;
  range: PlotRange;
  now: number;
  yearOf: YearOf;
}

export interface HistoryEntryModel {
  key: string;
  /** Path of the declaring event or note. */
  path: string;
  /** Empty when undated. */
  dateLabel: string;
  linkLabel: string;
  reason: string;
  amount: string;
  tone: ChangeTone;
  runningText: string;
  future: boolean;
  classes: string;
  colour: string;
  /** Fractions of the axis, from the previous value to the running one. */
  line: { left: number; width: number };
  dot: number;
  tooltip: string;
}

export interface HistoryYearModel {
  year: HistoryYear;
  label: string;
  countText: string;
  /** `−21 → −30 (−9)`. */
  changeText: string;
  netTone: ChangeTone;
  matchText: string | null;
  colour: string;
  /** Fractions of the axis, from the year's first value to its last. */
  line: { left: number; width: number };
  dot: number;
  tooltip: string;
  entries: HistoryEntryModel[];
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** `Note` for an undated entry; else the event title, or the filename for an untitled event. */
function linkLabelOf(entry: HistoryEntry): string {
  if (entry.at === null) return NOTE_LINK_LABEL;
  return entry.eventTitle ?? basename(entry.delta.declaredIn.path);
}

function amountOf(entry: HistoryEntry): string {
  return entry.delta.op === 'adjust' ? formatSigned(entry.delta.by) : SET_AMOUNT;
}

/** `+4 · 14 → 18 · Night of Ash`; `set` in place of the amount for a set. */
export function entryTooltip(entry: HistoryEntry): string {
  const from = formatNumber(Number(entry.previousValue));
  const to = formatNumber(Number(entry.runningValue));
  return [amountOf(entry), `${from}${ARROW}${to}`, linkLabelOf(entry)].join(SEPARATOR);
}

function bandSuffix(track: NumericTrack, value: number): string {
  const label = track.labelFor(value);
  return typeof label === 'string' ? ` (${label})` : '';
}

/** `4724: Changed by +9. Started at 3 (Disliked), ended at 12 (Liked)`; band names only on banded tracks. */
export function yearTooltip(label: string, from: number, to: number, track: NumericTrack): string {
  return (
    `${label}: Changed by ${formatSigned(to - from)}. ` +
    `Started at ${formatNumber(from)}${bandSuffix(track, from)}, ` +
    `ended at ${formatNumber(to)}${bandSuffix(track, to)}`
  );
}

function entryModel(entry: HistoryEntry, ctx: NumericHistoryContext): HistoryEntryModel {
  const { track, range } = ctx;
  const previous = Number(entry.previousValue);
  const running = Number(entry.runningValue);
  const isSet = entry.delta.op === 'set';
  return {
    key: entry.key,
    path: entry.delta.declaredIn.path,
    dateLabel: entry.at === null ? '' : entry.dateLabel,
    linkLabel: linkLabelOf(entry),
    reason: entry.reason ?? '',
    amount: amountOf(entry),
    tone: deltaTone(entry.delta),
    runningText: formatNumber(running),
    future: !entry.applied,
    classes: historyEntryClasses(entry, 'rel-num-entry') + (isSet ? ' is-set' : ''),
    colour: scaleColourCss(valueColour(track, running)),
    line: lineBetween(range, previous, running),
    dot: valueFraction(range, running),
    tooltip: entryTooltip(entry),
  };
}

function yearModel(year: HistoryYear, ctx: NumericHistoryContext): HistoryYearModel {
  const { track, range } = ctx;
  const from = Number(year.from);
  const to = Number(year.to);
  const net = to - from;
  const label = yearLabel(year);
  return {
    year,
    label,
    countText: yearCountLabel(year),
    changeText: `${formatNumber(from)}${ARROW}${formatNumber(to)} (${formatSigned(net)})`,
    netTone: numberTone(net),
    matchText: yearMatchLabel(year),
    colour: scaleColourCss(valueColour(track, to)),
    line: lineBetween(range, from, to),
    dot: valueFraction(range, to),
    tooltip: yearTooltip(label, from, to, track),
    entries: year.entries.map((entry) => entryModel(entry, ctx)),
  };
}

/** The year groups of a row's history, ready to render. */
export function numericHistoryModel(
  history: readonly HistoryEntry[],
  ctx: NumericHistoryContext,
): HistoryYearModel[] {
  return groupHistoryByYear(history, ctx.now, ctx.yearOf).map((year) => yearModel(year, ctx));
}
