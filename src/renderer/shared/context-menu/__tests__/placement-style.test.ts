import { describe, it, expect } from 'vitest';
import { placementStyle } from '../placement-style';

describe('placementStyle', () => {
  it('maps a below placement to top and a cap', () => {
    expect(placementStyle({ left: 10, top: 20, side: 'below', maxHeight: 300 })).toEqual({
      left: 10,
      top: 20,
      bottom: undefined,
      maxHeight: 300,
    });
  });
  it('maps an above placement to bottom and a cap', () => {
    expect(placementStyle({ left: 10, bottom: 40, side: 'above', maxHeight: 200 })).toEqual({
      left: 10,
      top: undefined,
      bottom: 40,
      maxHeight: 200,
    });
  });
});
