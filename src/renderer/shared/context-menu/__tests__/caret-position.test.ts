import { describe, it, expect } from 'vitest';
import { computeCaretPlacement } from '../caret-position';
import type { Rect } from '../submenu-position';

const VIEWPORT = { width: 800, height: 600 };

function rect(overrides: Partial<Rect> = {}): Rect {
  return {
    top: 100,
    left: 50,
    right: 150,
    bottom: 120,
    width: 100,
    height: 20,
    ...overrides,
  };
}

describe('computeCaretPlacement', () => {
  it('prefers below when it fits', () => {
    const placement = computeCaretPlacement(rect(), { width: 200, height: 150 }, VIEWPORT, 'below');
    expect(placement.side).toBe('below');
    expect(placement.top).toBe(122); // lineRect.bottom (120) + GAP (2)
    expect(placement.bottom).toBeUndefined();
  });

  it('flips above when below does not fit', () => {
    const line = rect({ top: 550, bottom: 570 });
    const placement = computeCaretPlacement(line, { width: 200, height: 100 }, VIEWPORT, 'below');
    expect(placement.side).toBe('above');
    expect(placement.bottom).toBe(52); // viewport.height (600) - lineRect.top (550) + GAP (2)
    expect(placement.top).toBeUndefined();
  });

  it('prefers above when asked and it fits', () => {
    const line = rect({ top: 300, bottom: 320 });
    const placement = computeCaretPlacement(line, { width: 200, height: 100 }, VIEWPORT, 'above');
    expect(placement.side).toBe('above');
    expect(placement.bottom).toBe(302); // 600 - 300 + 2
    expect(placement.top).toBeUndefined();
  });

  it('flips below when above does not fit (prefer above)', () => {
    const line = rect({ top: 15, bottom: 35 });
    const placement = computeCaretPlacement(line, { width: 200, height: 100 }, VIEWPORT, 'above');
    expect(placement.side).toBe('below');
    expect(placement.top).toBe(37); // lineRect.bottom (35) + GAP (2)
    expect(placement.bottom).toBeUndefined();
  });

  it('best fit when neither side fits (both preferences pick the side with more room)', () => {
    const line = rect({ top: 300, bottom: 320 });
    const popupSize = { width: 200, height: 320 }; // taller than either side's available space
    const preferBelow = computeCaretPlacement(line, popupSize, VIEWPORT, 'below');
    const preferAbove = computeCaretPlacement(line, popupSize, VIEWPORT, 'above');

    // above has 290px of room vs below's 270px, so both preferences land on 'above'.
    expect(preferBelow.side).toBe('above');
    expect(preferAbove.side).toBe('above');
    expect(preferBelow.maxHeight).toBe(290);
    expect(preferAbove.maxHeight).toBe(290);

    // Clamped to stay within the viewport (top-edge >= EDGE_MARGIN).
    expect(preferAbove.bottom).toBeDefined();
    expect(preferAbove.bottom as number).toBeGreaterThanOrEqual(8);
    expect(preferAbove.bottom as number).toBeLessThanOrEqual(VIEWPORT.height - 8);
  });

  it('side does not depend on later height growth', () => {
    const line = rect({ top: 400, bottom: 420 });
    const small = computeCaretPlacement(line, { width: 200, height: 100 }, VIEWPORT, 'above');
    const grown = computeCaretPlacement(line, { width: 200, height: 300 }, VIEWPORT, 'above');

    expect(small.side).toBe('above');
    expect(grown.side).toBe('above');
    // The bottom anchor is independent of popup height once 'above' is chosen and fits.
    expect(small.bottom).toBe(grown.bottom);
    expect(small.bottom).toBe(202); // 600 - 400 + 2
  });

  it('clamps left to edge margin', () => {
    const nearRight = rect({ left: 790 });
    const rightPlacement = computeCaretPlacement(
      nearRight,
      { width: 200, height: 100 },
      VIEWPORT,
      'below',
    );
    expect(rightPlacement.left).toBe(592); // 800 - 200 - 8

    const nearLeft = rect({ left: -50 });
    const leftPlacement = computeCaretPlacement(
      nearLeft,
      { width: 50, height: 100 },
      VIEWPORT,
      'below',
    );
    expect(leftPlacement.left).toBe(8);
  });
});
