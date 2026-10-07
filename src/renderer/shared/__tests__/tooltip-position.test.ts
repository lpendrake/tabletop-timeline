import { describe, it, expect } from 'vitest';
import { computeTooltipPosition } from '../tooltip-position';

describe('computeTooltipPosition', () => {
  it('anchors the left edge at the pointer when maxWidth fits', () => {
    const pos = computeTooltipPosition({ left: 100, top: 400 }, 1200, 600, 360);
    expect(pos).toEqual({ left: 100, bottom: 206 });
  });

  it('anchors the right edge at the pointer when maxWidth does not fit before the right edge', () => {
    const pos = computeTooltipPosition({ left: 1150, top: 400 }, 1200, 600, 360);
    expect(pos).toEqual({ right: 1200 - 1150, bottom: 206 });
  });

  it('stays left-anchored when maxWidth ends exactly at the right margin', () => {
    const pos = computeTooltipPosition({ left: 1200 - 8 - 360, top: 400 }, 1200, 600, 360);
    expect(pos).toEqual({ left: 1200 - 8 - 360, bottom: 206 });
  });

  it('switches to right-anchored one pixel past the right margin', () => {
    const pos = computeTooltipPosition({ left: 1200 - 8 - 360 + 1, top: 400 }, 1200, 600, 360);
    expect(pos).toHaveProperty('right');
  });

  it('keeps an 8px margin from the right edge when the pointer is at the edge', () => {
    const pos = computeTooltipPosition({ left: 1198, top: 400 }, 1200, 600, 360);
    expect(pos).toEqual({ right: 8, bottom: 206 });
  });

  it('clamps left to 8 when the pointer is near the left edge', () => {
    const pos = computeTooltipPosition({ left: 4, top: 400 }, 1200, 600, 360);
    expect(pos).toEqual({ left: 8, bottom: 206 });
  });

  it('places the tooltip bottom edge 6px above the pointer', () => {
    const pos = computeTooltipPosition({ left: 100, top: 400 }, 1200, 600, 360);
    expect(pos.bottom).toBe(600 - 400 + 6);
  });

  it('uses the given maxWidth to decide which side to anchor', () => {
    const anchor = { left: 1000, top: 400 };
    expect(computeTooltipPosition(anchor, 1200, 600, 150)).toEqual({ left: 1000, bottom: 206 });
    expect(computeTooltipPosition(anchor, 1200, 600, 240)).toEqual({ right: 200, bottom: 206 });
  });
});
