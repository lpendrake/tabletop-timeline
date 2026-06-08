import type { EventListItem } from '../data/types';
import type { WeekdayColors } from '../../theme';
import type { ViewState, ViewportSize } from '../math/zoom';
import { secondsToX } from '../math/zoom';
import type { CalendarDate } from '../../../shared/calendar';
import { CalendarProvider } from '../calendar/provider';

export const CARD_HEIGHT = 64;
export const CARD_GAP = 24;
export const CARD_PADDING_X = 12;
// Cards beyond this row are hidden rather than stacking off-screen.
// At typical zoom a day spans ~200px; 8 rows already exceeds viewport height.
export const MAX_ROWS = 8;

export interface LaidOutCard {
  event: EventListItem;
  parsedDate: CalendarDate;
  x: number;
  seconds: number;
  isFuture: boolean;
}

export interface CardPlacement {
  row: number;
  width: number;
}

// ---------------------------------------------------------------------------
// Backward-compat adapter — mirrors the pattern in calendar/format.ts
// ---------------------------------------------------------------------------

/** Shape of the legacy Golarion date object used by existing callers (axis.tsx etc.). */
export type LegacyDate = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function toCalendarDate(d: CalendarDate | LegacyDate): CalendarDate {
  return 'kind' in d ? d : { kind: 'month', ...d };
}

/**
 * Return the weekday colour for a date.
 *
 * Accepts either the legacy plain date `{year,month,day,hour,minute,second}`
 * or a full `CalendarDate`. An intercalary day (or any date whose weekday
 * index exceeds the colours array) falls back to the first colour.
 */
export function weekdayColor(date: CalendarDate | LegacyDate, weekdays: WeekdayColors): string {
  const cal = CalendarProvider.get();
  const idx = cal.weekdayIndex(toCalendarDate(date));
  if (idx === null || idx >= weekdays.length) return weekdays[0] ?? '#888888';
  return weekdays[idx];
}

export function layoutCards(
  events: EventListItem[],
  view: ViewState,
  size: ViewportSize,
  inGameNowSeconds: number,
): LaidOutCard[] {
  const cal = CalendarProvider.get();
  return events.flatMap((ev) => {
    // Prefer epochSeconds; fall back to parsing the legacy date string.
    if (ev.epochSeconds != null) {
      const parsedDate = cal.fromEpochSeconds(ev.epochSeconds);
      const seconds = ev.epochSeconds;
      return [
        {
          event: ev,
          parsedDate,
          seconds,
          x: secondsToX(seconds, view, size),
          isFuture: seconds > inGameNowSeconds,
        },
      ];
    }
    const parsedDate = ev.date ? cal.tryParse(ev.date) : null;
    if (!parsedDate) return [];
    const seconds = cal.toEpochSeconds(parsedDate);
    return [
      {
        event: ev,
        parsedDate,
        seconds,
        x: secondsToX(seconds, view, size),
        isFuture: seconds > inGameNowSeconds,
      },
    ];
  });
}

export interface ExpansionLayout {
  expandsDown: boolean;
  cardTop: number;
  cardWidth: number;
}

/**
 * Compute geometry for an expanded card.
 *
 * Returns whether the expanded section opens downward (to stay on-screen),
 * the adjusted top of the card element, and the card width (at least previewWidth).
 */
export function computeExpansionLayout(
  normalTop: number,
  expandedHeight: number,
  normalWidth: number,
  previewWidth: number,
): ExpansionLayout {
  const expandsDown = normalTop - expandedHeight < 0;
  const cardTop = expandsDown ? normalTop : normalTop - expandedHeight;
  const cardWidth = Math.max(normalWidth, previewWidth);
  return { expandsDown, cardTop, cardWidth };
}

export function assignRows(laidOut: LaidOutCard[]): Map<string, CardPlacement> {
  const rows: { left: number; right: number }[][] = [];
  const sorted = [...laidOut].sort((a, b) => a.x - b.x);
  const placements = new Map<string, CardPlacement>();

  for (const card of sorted) {
    // 8px/char is a font-agnostic estimate for 15px/500-weight text. CSS
    // text-overflow:ellipsis handles the rare case where a title overflows.
    const estWidth = Math.max(120, Math.min(360, card.event.title.length * 8 + CARD_PADDING_X * 2));
    const left = card.x - estWidth / 2;
    const right = card.x + estWidth / 2;

    // O(n²) worst case — acceptable for typical campaign sizes (<200 events).
    let row = 0;
    while (row < MAX_ROWS) {
      if (!rows[row]) rows[row] = [];
      const overlaps = rows[row].some((o) => !(right < o.left || left > o.right));
      if (!overlaps) {
        rows[row].push({ left, right });
        break;
      }
      row++;
    }
    if (row < MAX_ROWS) {
      placements.set(card.event.filename, { row, width: estWidth });
    }
  }

  return placements;
}
