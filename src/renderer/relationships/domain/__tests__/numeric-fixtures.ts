import {
  EMPTY_TRACK_LIBRARY,
  pf2eReputationSpec,
  resolveTrack,
  resolveTrackSpec,
  type NumericTrack,
  type NumericTrackSpec,
} from '../../../../shared/relationships';

function fixture(id: string, over: Partial<NumericTrackSpec>): NumericTrack {
  return resolveTrackSpec({ ...pf2eReputationSpec, id, ...over }) as NumericTrack;
}

/** The built-in PF2E Reputation track: -50..50, seven bands. */
export const pf2e = resolveTrack('rp01', EMPTY_TRACK_LIBRARY) as NumericTrack;

/** 0..100 with ten bands b0..b9, each 10 wide. */
export const tenBands = fixture('fx-ten', {
  min: 0,
  max: 100,
  initial: 0,
  bands: Array.from({ length: 10 }, (_, i) => ({ key: `b${i}`, label: `b${i}`, start: i * 10 })),
});

/** -10..10, no bands. */
export const noBands = fixture('fx-none', { min: -10, max: 10, initial: 0, bands: undefined });

/** No bounds, no bands, starting at 0. */
export const unbounded = fixture('fx-unbounded', {
  min: null,
  max: null,
  initial: 0,
  bands: undefined,
});

/** No bounds, three bands starting at -10, 0 and 10. */
export const unboundedBands = fixture('fx-unbounded-bands', {
  min: null,
  max: null,
  initial: 0,
  bands: [
    { key: 'low', label: 'Low', start: -10 },
    { key: 'mid', label: 'Mid', start: 0 },
    { key: 'high', label: 'High', start: 10 },
  ],
});

/** Floor at 0, no ceiling, no bands. */
export const halfUnbounded = fixture('fx-half', {
  min: 0,
  max: null,
  initial: 0,
  bands: undefined,
});

/** 0..1 in steps of 0.1, starting at 0.1, no bands. */
export const tenths = fixture('fx-tenths', {
  min: 0,
  max: 1,
  initial: 0.1,
  step: 0.1,
  bands: undefined,
});

/** No floor, ceiling at 10, two bands starting at -5 and 0. */
export const openFloorBands = fixture('fx-open-floor', {
  min: null,
  max: 10,
  initial: 0,
  bands: [
    { key: 'low', label: 'Low', start: -5 },
    { key: 'high', label: 'High', start: 0 },
  ],
});

/** Bounded with min === max. */
export const pinned = fixture('fx-pinned', {
  min: 5,
  max: 5,
  initial: 5,
  bands: undefined,
});
