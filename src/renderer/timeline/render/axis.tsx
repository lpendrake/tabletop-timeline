import type { ReactElement } from 'react';
import './axis.css';
import type { ViewState, ViewportSize } from '../math/zoom';
import { xToSeconds, secondsToX } from '../math/zoom';
import { CalendarProvider } from '../calendar/provider';
import { formatAxisHour, formatAxisDayTick } from '../calendar/format';
import type { WeekdayColors } from '../../theme';
import { weekdayColor } from './cards';

export interface TimeTier {
  readonly id: 'midday' | 'hour' | 'half' | 'quarter' | 'minute';
  /** Seconds between ticks of this tier. */
  readonly stepSecs: number;
  /** Minimum pixels-per-day to render the tick mark. */
  readonly markMinPPD: number;
  /** Tick mark height in px (centered on the axis line). */
  readonly markHeight: number;
  /** Minimum pixels-per-day to also render the hh:mm label. */
  readonly labelMinPPD: number;
}

/**
 * Returns the intraday tier list for a given calendar day length (in seconds).
 * The midday step derives from secondsPerDay; hour/half/quarter/minute are always
 * literal seconds (valid for any 60-min-hour / 60-sec-min calendar, including 25h days).
 */
export function buildTimeTiers(secondsPerDay: number): readonly TimeTier[] {
  return [
    { id: 'midday', stepSecs: secondsPerDay / 2, markMinPPD: 80, markHeight: 12, labelMinPPD: 120 },
    { id: 'hour', stepSecs: 3600, markMinPPD: 800, markHeight: 8, labelMinPPD: 1500 },
    { id: 'half', stepSecs: 1800, markMinPPD: 1600, markHeight: 5, labelMinPPD: 3000 },
    { id: 'quarter', stepSecs: 900, markMinPPD: 3200, markHeight: 3, labelMinPPD: 6000 },
    { id: 'minute', stepSecs: 60, markMinPPD: 40000, markHeight: 2, labelMinPPD: 100000 },
  ];
}

/**
 * ALL_TIERS for Golarion (86400s day) — kept for backward-compatible tests.
 * Production code calls buildTimeTiers(cal.secondsPerDay()) inside the render.
 */
export const ALL_TIERS: readonly TimeTier[] = buildTimeTiers(86400);

/** Choose day-tick spacing that keeps labels readable at the current zoom level. */
export function chooseDayStep(pixelsPerDay: number): number {
  const TARGET_PX = 80;
  const candidates = [1, 2, 5, 10, 20, 30, 60, 90, 180, 365];
  const idealDays = TARGET_PX / pixelsPerDay;
  for (const c of candidates) {
    if (c >= idealDays) return c;
  }
  return candidates[candidates.length - 1];
}

/**
 * Returns the coarsest tier (from `tiers`, ordered coarsest-first) whose step
 * evenly divides `withinDay`, or null if none do.
 *
 * Pure function — exported for tests.
 */
export function naturalTier(withinDay: number, tiers: readonly TimeTier[]): TimeTier | null {
  for (const tier of tiers) {
    if (withinDay % tier.stepSecs === 0) return tier;
  }
  return null;
}

interface AxisProps {
  view: ViewState;
  size: ViewportSize;
  weekdays: WeekdayColors;
}

export function Axis({ view, size, weekdays }: AxisProps): ReactElement | null {
  if (size.width === 0 || size.height === 0) return null;

  const cal = CalendarProvider.get();
  const secondsPerDay = cal.secondsPerDay();

  const axisY = Math.floor(size.height * 0.8);
  const pixelsPerDay = secondsPerDay / view.secondsPerPixel;
  const dayStep = chooseDayStep(pixelsPerDay);

  const startSec = xToSeconds(0, view, size);
  const endSec = xToSeconds(size.width, view, size);
  const startDay = Math.floor(startSec / secondsPerDay) - 1;
  const endDay = Math.ceil(endSec / secondsPerDay) + 1;

  const firstTickDay = Math.ceil(startDay / dayStep) * dayStep;

  // ---- Day ticks ----
  const dayTicks: ReactElement[] = [];
  for (let d = firstTickDay; d <= endDay; d += dayStep) {
    const x = secondsToX(d * secondsPerDay, view, size);
    if (x < -50 || x > size.width + 50) continue;

    const date = cal.fromEpochDays(d);
    const pxPerTick = pixelsPerDay * dayStep;
    const dayLabelLevel = pxPerTick >= 55 ? 'full' : 'short';

    dayTicks.push(
      <div key={d} className="axis-tick" style={{ left: x, top: axisY }}>
        <div className="axis-tick-mark" />
        <div className="axis-tick-label">
          {dayLabelLevel === 'short' ? (
            <>{formatAxisDayTick(date, 'short')}</>
          ) : (
            (() => {
              const label = formatAxisDayTick(date, 'full');
              const idx = cal.weekdayIndex(date);
              if (idx !== null) {
                const color = weekdayColor(date, weekdays);
                // Split "Wea 4" into abbrev and day number parts for coloring
                const spaceIdx = label.indexOf(' ');
                if (spaceIdx > -1) {
                  return (
                    <>
                      <span style={{ color }}>{label.slice(0, spaceIdx)}</span>
                      {label.slice(spaceIdx)}
                    </>
                  );
                }
              }
              return <>{label}</>;
            })()
          )}
        </div>
      </div>,
    );
  }

  // ---- Pinned day label when zoomed to hours ----
  let pinnedDay: ReactElement | null = null;
  if (dayStep === 1) {
    const leftDay = Math.floor(startSec / secondsPerDay);
    const leftDayX = secondsToX(leftDay * secondsPerDay, view, size);
    if (leftDayX < 0) {
      const date = cal.fromEpochDays(leftDay);
      const label = formatAxisDayTick(date, 'full');
      const idx = cal.weekdayIndex(date);
      const content =
        idx !== null ? (
          (() => {
            const color = weekdayColor(date, weekdays);
            const spaceIdx = label.indexOf(' ');
            if (spaceIdx > -1) {
              return (
                <>
                  <span style={{ color }}>{label.slice(0, spaceIdx)}</span>
                  {label.slice(spaceIdx)}
                </>
              );
            }
            return <>{label}</>;
          })()
        ) : (
          <>{label}</>
        );

      pinnedDay = (
        // +17px: clears the axis-tick-mark height (21px) minus the tick offset (-4px)
        <div className="axis-day-pin" style={{ left: 8, top: axisY + 17 }}>
          {content}
        </div>
      );
    }
  }

  // ---- Month bands and labels ----
  const BAND_TOP = axisY - 2;
  const BAND_HEIGHT = 100;
  const LABEL_MIN_BAND_PX = 60;

  const monthBands: ReactElement[] = [];
  const monthLabels: ReactElement[] = [];

  const startDate = cal.fromEpochDays(Math.floor(startSec / secondsPerDay));
  // startDate may be intercalary — find the month to start from
  const startYear = startDate.year;
  const startMonth = startDate.kind === 'month' ? startDate.month : 1;
  let monthStartDay = cal.toEpochDays(
    startDate.kind === 'month'
      ? { ...startDate, day: 1, hour: 0, minute: 0, second: 0 }
      : { kind: 'month', year: startYear, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
  );

  // Ensure we start at the beginning of the correct month (not necessarily startMonth)
  // by going back one month if needed
  void startMonth; // used indirectly via monthStartDay above

  while (true) {
    const md = cal.fromEpochDays(monthStartDay);
    // Skip intercalary days — advance to the next regular month day
    if (md.kind === 'intercalary') {
      monthStartDay += 1;
      continue;
    }

    const dm = cal.daysInMonth(md.year, md.month);
    const monthEndDay = monthStartDay + dm;

    const bandStartX = secondsToX(monthStartDay * secondsPerDay, view, size);
    const bandEndX = secondsToX(monthEndDay * secondsPerDay, view, size);

    if (bandStartX > size.width) break;
    if (bandEndX < 0) {
      monthStartDay = monthEndDay;
      continue;
    }

    const clampedStart = Math.max(0, bandStartX);
    const clampedEnd = Math.min(size.width, bandEndX);

    monthBands.push(
      <div
        key={monthStartDay}
        className={`axis-month-band${md.month % 2 === 0 ? ' is-even' : ''}`}
        style={{
          left: clampedStart,
          width: clampedEnd - clampedStart,
          top: BAND_TOP,
          height: BAND_HEIGHT,
        }}
      />,
    );

    if (clampedEnd - clampedStart >= LABEL_MIN_BAND_PX) {
      const labelX = Math.max(8, bandStartX + 8);
      const era = cal.eraFor(md.year);
      monthLabels.push(
        <div
          key={`label-${monthStartDay}`}
          className="axis-month-label"
          style={{ left: labelX, top: axisY + 64 }}
        >
          <div className="axis-month-name">{cal.monthName(md.month)}</div>
          <div className="axis-month-year">
            {md.year} {era.suffix}
          </div>
        </div>,
      );
    }

    monthStartDay = monthEndDay;
  }

  // ---- Intraday time dividers ----
  const allTiers = buildTimeTiers(secondsPerDay);
  const activeTiers = allTiers.filter((t) => pixelsPerDay >= t.markMinPPD);
  const timeTicks: ReactElement[] = [];

  if (activeTiers.length > 0) {
    const stepSecs = activeTiers[activeTiers.length - 1].stepSecs;
    const firstTick = Math.ceil(startSec / stepSecs) * stepSecs;

    for (let t = firstTick; t <= endSec; t += stepSecs) {
      // Positive modulo — in-game seconds are always positive, but guard anyway.
      const withinDay = ((t % secondsPerDay) + secondsPerDay) % secondsPerDay;
      if (withinDay === 0) continue; // midnight → owned by day-boundary tick

      const tier = naturalTier(withinDay, activeTiers);
      if (!tier) continue;

      const x = secondsToX(t, view, size);
      if (x < -5 || x > size.width + 5) continue;

      let label: string | null = null;
      if (pixelsPerDay >= tier.labelMinPPD) {
        label = formatAxisHour(cal.fromEpochSeconds(t), true);
      }

      timeTicks.push(
        <div
          key={t}
          className={`axis-time-tick axis-time-${tier.id}`}
          style={{ left: x, top: axisY }}
        >
          <div className="axis-time-mark" />
          {label !== null && <div className="axis-time-label">{label}</div>}
        </div>,
      );
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}
    >
      {/* Month bands behind everything else */}
      {monthBands}
      <div className="axis-line" style={{ top: axisY }} />
      {dayTicks}
      {pinnedDay}
      {monthLabels}
      {/* Intraday ticks sit above month bands */}
      {timeTicks}
    </div>
  );
}
