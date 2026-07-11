import { describe, it, expect } from 'vitest';
import { computeSubmenuPosition, type Rect } from '../submenu-position';

const VIEWPORT = { width: 800, height: 600 };

function rect(overrides: Partial<Rect> = {}): Rect {
  return {
    top: 100,
    left: 100,
    right: 200,
    bottom: 120,
    width: 100,
    height: 20,
    ...overrides,
  };
}

describe('computeSubmenuPosition', () => {
  it('places the panel to the right of, and top-aligned with, the parent row by default', () => {
    const pos = computeSubmenuPosition(rect(), { width: 150, height: 200 }, VIEWPORT);
    expect(pos).toEqual({ x: 200, y: 100 });
  });

  it('flips to the left of the row when it would overflow the right edge', () => {
    const parent = rect({ left: 700, right: 780, top: 100, bottom: 120 });
    const pos = computeSubmenuPosition(parent, { width: 150, height: 100 }, VIEWPORT);
    // 780 + 150 = 930 > 800 - 8, so it should flip left of the row.
    expect(pos.x).toBe(700 - 150);
  });

  it('shifts up when the panel would overflow the bottom edge', () => {
    const parent = rect({ top: 550, bottom: 570 });
    const pos = computeSubmenuPosition(parent, { width: 150, height: 200 }, VIEWPORT);
    // 550 + 200 = 750 > 600 - 8, so it should be pinned to the bottom margin.
    expect(pos.y).toBe(VIEWPORT.height - 200 - 8);
  });

  it('clamps x so a very wide panel never renders off the left edge', () => {
    const parent = rect({ left: 5, right: 20 });
    const pos = computeSubmenuPosition(parent, { width: 1000, height: 50 }, VIEWPORT);
    expect(pos.x).toBeGreaterThanOrEqual(8);
  });

  it('clamps y so the panel never renders above the top edge', () => {
    const parent = rect({ top: -50, bottom: -30 });
    const pos = computeSubmenuPosition(parent, { width: 100, height: 500 }, VIEWPORT);
    expect(pos.y).toBeGreaterThanOrEqual(8);
  });
});
