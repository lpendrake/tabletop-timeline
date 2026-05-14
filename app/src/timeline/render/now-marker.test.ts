// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderNowMarker, NOW_MARKER_LABEL_OFFSET_PX } from './now-marker.ts';
import { parseISOString, toAbsoluteSeconds } from '../../calendar/golarian.ts';
import { DEFAULT_SECONDS_PER_PIXEL, axisY, secondsToX } from '../interactions/zoom.ts';
import type { ViewState, ViewportSize } from '../interactions/zoom.ts';

// 4726-05-04 at midnight is a stable test date
const NOW_DATE = '4726-05-04';
const NOW_WITH_TIME = '4726-05-04T15:30:00';

function nowSecs(iso: string): number {
  return toAbsoluteSeconds(parseISOString(iso));
}

function makeView(centerSeconds: number, secondsPerPixel = DEFAULT_SECONDS_PER_PIXEL): ViewState {
  return { centerSeconds, secondsPerPixel };
}

function makeSize(width = 1000, height = 600): ViewportSize {
  return { width, height };
}

describe('renderNowMarker', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  // ── Visibility ──────────────────────────────────────────────────────────────

  it('renders a .now-marker element when the position is in the viewport', () => {
    const secs = nowSecs(NOW_DATE);
    renderNowMarker(host, secs, makeView(secs), makeSize());
    expect(host.querySelector('.now-marker')).not.toBeNull();
  });

  it('returns null and adds nothing when off-screen to the left', () => {
    const secs = nowSecs(NOW_DATE);
    // Push center far to the right so nowX < 0
    const view = makeView(secs + 2000 * DEFAULT_SECONDS_PER_PIXEL);
    const result = renderNowMarker(host, secs, view, makeSize());
    expect(result).toBeNull();
    expect(host.querySelector('.now-marker')).toBeNull();
  });

  it('returns null and adds nothing when off-screen to the right', () => {
    const secs = nowSecs(NOW_DATE);
    // Push center far to the left so nowX > width
    const view = makeView(secs - 2000 * DEFAULT_SECONDS_PER_PIXEL);
    const result = renderNowMarker(host, secs, view, makeSize());
    expect(result).toBeNull();
    expect(host.querySelector('.now-marker')).toBeNull();
  });

  it('returns the created element when visible', () => {
    const secs = nowSecs(NOW_DATE);
    const result = renderNowMarker(host, secs, makeView(secs), makeSize());
    expect(result).not.toBeNull();
    expect(result?.classList.contains('now-marker')).toBe(true);
  });

  // ── Idempotency ─────────────────────────────────────────────────────────────

  it('replaces a previous marker instead of adding a second one', () => {
    const secs = nowSecs(NOW_DATE);
    const view = makeView(secs);
    renderNowMarker(host, secs, view, makeSize());
    renderNowMarker(host, secs, view, makeSize());
    expect(host.querySelectorAll('.now-marker')).toHaveLength(1);
  });

  it('removes an existing off-screen marker when the new position is also off-screen', () => {
    const secs = nowSecs(NOW_DATE);
    // First call puts a marker on-screen
    renderNowMarker(host, secs, makeView(secs), makeSize());
    expect(host.querySelectorAll('.now-marker')).toHaveLength(1);
    // Second call: now is off-screen — should clean up the old one
    const offView = makeView(secs + 2000 * DEFAULT_SECONDS_PER_PIXEL);
    renderNowMarker(host, secs, offView, makeSize());
    expect(host.querySelectorAll('.now-marker')).toHaveLength(0);
  });

  // ── Position ────────────────────────────────────────────────────────────────

  it('places the marker at the horizontal centre when now equals centerSeconds', () => {
    const secs = nowSecs(NOW_DATE);
    const size = makeSize(1000, 600);
    renderNowMarker(host, secs, makeView(secs), size);
    const marker = host.querySelector('.now-marker') as HTMLElement;
    expect(marker.style.left).toBe('500px');
  });

  it('positions labels below the axis at the expected offset', () => {
    const secs = nowSecs(NOW_DATE);
    const size = makeSize(1000, 600);
    renderNowMarker(host, secs, makeView(secs), size);
    const labels = host.querySelector('.now-marker-labels') as HTMLElement;
    expect(labels.style.top).toBe(`${axisY(size) + NOW_MARKER_LABEL_OFFSET_PX}px`);
  });

  it('renders the marker when nowX is exactly 0 (left edge)', () => {
    const secs = nowSecs(NOW_DATE);
    const size = makeSize(1000, 600);
    // Place now exactly at left edge: centerSeconds such that secondsToX returns 0
    // secondsToX(s, view, size) = width/2 + (s - center) / spp = 0
    // => center = s + (width/2) * spp
    const view = makeView(secs + (size.width / 2) * DEFAULT_SECONDS_PER_PIXEL);
    const computedX = secondsToX(secs, view, size);
    expect(Math.round(computedX)).toBe(0);
    const result = renderNowMarker(host, secs, view, size);
    expect(result).not.toBeNull();
  });

  it('renders the marker when nowX is exactly at the right edge (size.width)', () => {
    const secs = nowSecs(NOW_DATE);
    const size = makeSize(1000, 600);
    // secondsToX = width/2 + (s - center) / spp = width
    // => center = s - (width/2) * spp
    const view = makeView(secs - (size.width / 2) * DEFAULT_SECONDS_PER_PIXEL);
    const computedX = secondsToX(secs, view, size);
    expect(Math.round(computedX)).toBe(size.width);
    const result = renderNowMarker(host, secs, view, size);
    expect(result).not.toBeNull();
  });

  // ── Label content ───────────────────────────────────────────────────────────

  it('renders the day-of-month and month name in .now-marker-date', () => {
    const secs = nowSecs(NOW_DATE);
    renderNowMarker(host, secs, makeView(secs), makeSize());
    const dateEl = host.querySelector('.now-marker-date');
    expect(dateEl?.textContent).toContain('4th');
    expect(dateEl?.textContent).toContain('Desnus');
  });

  it('renders the year in .now-marker-year', () => {
    const secs = nowSecs(NOW_DATE);
    renderNowMarker(host, secs, makeView(secs), makeSize());
    const yearEl = host.querySelector('.now-marker-year');
    expect(yearEl?.textContent).toContain('4726');
    expect(yearEl?.textContent).toContain('AR');
  });

  it('renders a .now-marker-time element when the time is not midnight', () => {
    const secs = nowSecs(NOW_WITH_TIME);
    renderNowMarker(host, secs, makeView(secs), makeSize());
    const timeEl = host.querySelector('.now-marker-time');
    expect(timeEl).not.toBeNull();
    expect(timeEl?.textContent).toBe('15:30');
  });

  it('omits .now-marker-time when the time is midnight', () => {
    const secs = nowSecs(NOW_DATE);
    renderNowMarker(host, secs, makeView(secs), makeSize());
    expect(host.querySelector('.now-marker-time')).toBeNull();
  });

  it('pads single-digit hours with a leading zero', () => {
    const secs = nowSecs('4726-05-04T09:05:00');
    renderNowMarker(host, secs, makeView(secs), makeSize());
    expect(host.querySelector('.now-marker-time')?.textContent).toBe('09:05');
  });

  // ── Label ordering ──────────────────────────────────────────────────────────

  it('renders date before year before time in DOM order', () => {
    const secs = nowSecs(NOW_WITH_TIME);
    renderNowMarker(host, secs, makeView(secs), makeSize());
    const labels = host.querySelector('.now-marker-labels')!;
    const children = Array.from(labels.children).map(el => el.className);
    expect(children).toEqual(['now-marker-date', 'now-marker-year', 'now-marker-time']);
  });

  it('renders date before year with no time element in DOM order when midnight', () => {
    const secs = nowSecs(NOW_DATE);
    renderNowMarker(host, secs, makeView(secs), makeSize());
    const labels = host.querySelector('.now-marker-labels')!;
    const children = Array.from(labels.children).map(el => el.className);
    expect(children).toEqual(['now-marker-date', 'now-marker-year']);
  });
});
