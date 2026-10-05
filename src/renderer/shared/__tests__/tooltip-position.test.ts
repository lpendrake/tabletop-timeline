import { describe, it, expect } from 'vitest';
import { computeTooltipPosition } from '../tooltip-position';

describe('computeTooltipPosition', () => {
  it('returns anchor.left as-is when it fits in the viewport', () => {
    const pos = computeTooltipPosition({ left: 100, top: 400 }, 1200, 600, 360);
    expect(pos.left).toBe(100);
  });

  it('clamps left so tooltip does not overflow viewport right edge', () => {
    const pos = computeTooltipPosition({ left: 1150, top: 400 }, 1200, 600, 360);
    expect(pos.left).toBe(1200 - 360 - 8);
  });

  it('clamps left to 8 when anchor is near the left edge', () => {
    const pos = computeTooltipPosition({ left: 4, top: 400 }, 1200, 600, 360);
    expect(pos.left).toBe(8);
  });

  it('places tooltip bottom edge 6px above anchor top', () => {
    const pos = computeTooltipPosition({ left: 100, top: 400 }, 1200, 600, 360);
    expect(pos.bottom).toBe(600 - 400 + 6);
  });

  it('clamps to the right edge using the given maxWidth', () => {
    const pos = computeTooltipPosition({ left: 1150, top: 400 }, 1200, 600, 240);
    expect(pos.left).toBe(1200 - 240 - 8);
  });
});
