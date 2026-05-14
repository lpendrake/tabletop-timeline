import { type ViewState, type ViewportSize, secondsToX, axisY } from '../interactions/zoom.ts';
import { fromAbsoluteSeconds } from '../../calendar/golarian.ts';
import { formatNowMarker } from '../../calendar/format.ts';

/** Vertical offset below the axis line where the label group starts. */
export const NOW_MARKER_LABEL_OFFSET_PX = 66;

/**
 * Render the "now" marker — a full-height vertical accent line at `nowSeconds`
 * with date/year label above and optional time label below the axis.
 *
 * Removes any existing `.now-marker` child of `host` before painting.
 * Returns the created element so the caller can attach interaction listeners,
 * or `null` when the position is off-screen.
 */
export function renderNowMarker(
  host: HTMLElement,
  nowSeconds: number,
  view: ViewState,
  size: ViewportSize,
): HTMLElement | null {
  const existing = host.querySelector('.now-marker');
  if (existing) existing.remove();

  const nowX = secondsToX(nowSeconds, view, size);
  if (nowX < 0 || nowX > size.width) return null;

  const y = axisY(size);
  const date = fromAbsoluteSeconds(nowSeconds);
  const [dayMonth, year, time] = formatNowMarker(date);

  const marker = document.createElement('div');
  marker.className = 'now-marker';
  marker.style.left = `${nowX}px`;

  const labels = document.createElement('div');
  labels.className = 'now-marker-labels';
  labels.style.top = `${y + NOW_MARKER_LABEL_OFFSET_PX}px`;

  const dateEl = document.createElement('div');
  dateEl.className = 'now-marker-date';
  dateEl.textContent = dayMonth;
  labels.appendChild(dateEl);

  const yearEl = document.createElement('div');
  yearEl.className = 'now-marker-year';
  yearEl.textContent = year;
  labels.appendChild(yearEl);

  if (time) {
    const timeEl = document.createElement('div');
    timeEl.className = 'now-marker-time';
    timeEl.textContent = time;
    labels.appendChild(timeEl);
  }

  marker.appendChild(labels);
  host.appendChild(marker);
  return marker;
}
