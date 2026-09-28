import { describe, it, expect } from 'vitest';
import { deriveInGameNowSeconds } from '../in-game-now';
import { createCalendar, golarionSpec } from '../../../shared/calendar';

const calendar = createCalendar(golarionSpec);

describe('deriveInGameNowSeconds', () => {
  it('prefers the numeric seconds field when present', () => {
    expect(deriveInGameNowSeconds({ in_game_now_seconds: 123 }, calendar)).toBe(123);
  });

  it('falls back to parsing the legacy string form', () => {
    const date = calendar.fromEpochSeconds(500);
    const legacyStr = calendar.format(date);
    expect(deriveInGameNowSeconds({ in_game_now: legacyStr }, calendar)).toBe(500);
  });

  it('is Infinity when neither field is set', () => {
    expect(deriveInGameNowSeconds({}, calendar)).toBe(Infinity);
    expect(deriveInGameNowSeconds(undefined, calendar)).toBe(Infinity);
    expect(deriveInGameNowSeconds(null, calendar)).toBe(Infinity);
  });

  it('is Infinity when the legacy string does not parse', () => {
    expect(deriveInGameNowSeconds({ in_game_now: 'not a date' }, calendar)).toBe(Infinity);
  });
});
