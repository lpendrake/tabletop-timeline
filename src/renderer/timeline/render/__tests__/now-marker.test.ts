import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { computeNowMarkerLayout } from '../now-marker';
import { CalendarProvider } from '../../calendar/provider';
import { DEFAULT_SECONDS_PER_PIXEL, type ViewState, type ViewportSize } from '../../math/zoom';

beforeEach(() => {
  CalendarProvider._reset();
});
afterEach(() => {
  CalendarProvider._reset();
});

const SIZE: ViewportSize = { width: 1200, height: 600 };
const NOW_ISO = '4726-05-04T15:00:00';

function nowSeconds(): number {
  const cal = CalendarProvider.get();
  const d = cal.tryParse(NOW_ISO);
  if (!d) throw new Error('Cannot parse NOW_ISO');
  return cal.toEpochSeconds(d);
}

function viewCenteredOn(seconds: number): ViewState {
  return { centerSeconds: seconds, secondsPerPixel: DEFAULT_SECONDS_PER_PIXEL };
}

describe('computeNowMarkerLayout', () => {
  it('returns null when viewport width is 0', () => {
    const NOW_SECS = nowSeconds();
    expect(
      computeNowMarkerLayout(
        viewCenteredOn(NOW_SECS),
        { width: 0, height: 600 },
        NOW_ISO,
        NOW_SECS,
      ),
    ).toBeNull();
  });

  it('returns null when viewport height is 0', () => {
    const NOW_SECS = nowSeconds();
    expect(
      computeNowMarkerLayout(
        viewCenteredOn(NOW_SECS),
        { width: 1200, height: 0 },
        NOW_ISO,
        NOW_SECS,
      ),
    ).toBeNull();
  });

  it('places the marker at viewport center when the view is centered on now', () => {
    const NOW_SECS = nowSeconds();
    const layout = computeNowMarkerLayout(viewCenteredOn(NOW_SECS), SIZE, NOW_ISO, NOW_SECS);
    expect(layout).not.toBeNull();
    expect(layout!.x).toBe(SIZE.width / 2);
  });

  it('places the label below the month-label band (axisY + 108)', () => {
    const NOW_SECS = nowSeconds();
    const layout = computeNowMarkerLayout(viewCenteredOn(NOW_SECS), SIZE, NOW_ISO, NOW_SECS)!;
    const axisY = Math.floor(SIZE.height * 0.8);
    // Month-label band starts at axisY+64 and runs ~35px; we sit below it.
    expect(layout.labelTop).toBe(axisY + 108);
    expect(layout.labelTop).toBeGreaterThan(axisY + 64 + 35);
  });

  it('shifts the marker right when the view is centered earlier than now', () => {
    const NOW_SECS = nowSeconds();
    const cal = CalendarProvider.get();
    // Center one day before "now" → marker should be to the right of viewport center.
    const earlier = NOW_SECS - cal.secondsPerDay();
    const layout = computeNowMarkerLayout(viewCenteredOn(earlier), SIZE, NOW_ISO, NOW_SECS);
    expect(layout).not.toBeNull();
    expect(layout!.x).toBeGreaterThan(SIZE.width / 2);
  });

  it('returns null when the marker is left of the viewport', () => {
    const NOW_SECS = nowSeconds();
    const cal = CalendarProvider.get();
    // Center far in the future so the now-marker falls offscreen-left.
    const future = NOW_SECS + 365 * cal.secondsPerDay();
    expect(computeNowMarkerLayout(viewCenteredOn(future), SIZE, NOW_ISO, NOW_SECS)).toBeNull();
  });

  it('returns null when the marker is right of the viewport', () => {
    const NOW_SECS = nowSeconds();
    const cal = CalendarProvider.get();
    const past = NOW_SECS - 365 * cal.secondsPerDay();
    expect(computeNowMarkerLayout(viewCenteredOn(past), SIZE, NOW_ISO, NOW_SECS)).toBeNull();
  });

  it('formats the date label as "4th of Desnus" / "4726 AR" / "15:00"', () => {
    const NOW_SECS = nowSeconds();
    const layout = computeNowMarkerLayout(viewCenteredOn(NOW_SECS), SIZE, NOW_ISO, NOW_SECS)!;
    expect(layout.dayMonth).toBe('4th of Desnus');
    expect(layout.year).toBe('4726 AR');
    expect(layout.time).toBe('15:00');
  });

  it('omits the time when in_game_now is at midnight (00:00)', () => {
    const cal = CalendarProvider.get();
    const midnightIso = '4726-05-04';
    const midnightDate = cal.tryParse(midnightIso)!;
    const midnightSecs = cal.toEpochSeconds(midnightDate);
    const layout = computeNowMarkerLayout(
      viewCenteredOn(midnightSecs),
      SIZE,
      midnightIso,
      midnightSecs,
    )!;
    expect(layout.time).toBeNull();
  });

  it('position updates with view.centerSeconds (scrolling behaviour)', () => {
    const NOW_SECS = nowSeconds();
    const a = computeNowMarkerLayout(viewCenteredOn(NOW_SECS - 3600), SIZE, NOW_ISO, NOW_SECS)!;
    const b = computeNowMarkerLayout(viewCenteredOn(NOW_SECS), SIZE, NOW_ISO, NOW_SECS)!;
    expect(a.x).not.toBe(b.x);
  });

  it('derives position from epochSeconds directly (not from the ISO string)', () => {
    const cal = CalendarProvider.get();
    // Use a different epochSeconds value than what the ISO string would parse to.
    // The ISO string says "4726-05-04T15:00:00" but we pass a different seconds value.
    const altDate = cal.tryParse('4726-06-01T10:00:00')!;
    const altSecs = cal.toEpochSeconds(altDate);
    // Center the view on altSecs so the marker is visible
    const layout = computeNowMarkerLayout(viewCenteredOn(altSecs), SIZE, NOW_ISO, altSecs)!;
    // The label should reflect altSecs (June 1), not the ISO string (May 4)
    expect(layout.dayMonth).toContain('Sarenith');
    expect(layout.x).toBe(SIZE.width / 2);
  });
});
