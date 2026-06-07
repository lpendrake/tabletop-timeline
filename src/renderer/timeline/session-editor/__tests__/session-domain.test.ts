// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { ThemeProvider } from '../../../theme';
import { CalendarProvider } from '../../calendar/provider';
import {
  nextDefaultColor,
  recordColorUsed,
  COLOR_STORAGE_KEY,
  toDatetimeLocal,
  fromDatetimeLocal,
  validateSessionBuffer,
  bufferFromSession,
  emptyBuffer,
  buildSavedSession,
  type SessionBuffer,
} from '../session-domain';
import type { Session } from '../../data/types';

// --- helpers ---

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    inGameStart: '4726-05-04T13:00:00',
    inGameEnd: '4726-05-04T17:00:00',
    realStart: '2024-01-15T13:00:00',
    realEnd: '2024-01-15T17:00:00',
    color: '#6b7c5a',
    notes: '',
    real_date: '2024-01-15',
    in_game_start: '4726-05-04T13:00:00',
    ...overrides,
  };
}

function makeBuffer(overrides: Partial<SessionBuffer> = {}): SessionBuffer {
  return {
    id: '',
    inGameStart: '4726-05-04T13:00:00',
    inGameEnd: '4726-05-04T17:00:00',
    realStart: '2024-01-15T13:00:00',
    realEnd: '2024-01-15T17:00:00',
    color: '#6b7c5a',
    notes: '',
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  CalendarProvider._reset();
});

// --- color cycling ---

describe('nextDefaultColor', () => {
  it('returns the first color when nothing stored', () => {
    expect(nextDefaultColor()).toBe(ThemeProvider.get().timeline.sessions[0]);
  });

  it('returns the second color after the first is recorded', () => {
    recordColorUsed(ThemeProvider.get().timeline.sessions[0]);
    expect(nextDefaultColor()).toBe(ThemeProvider.get().timeline.sessions[1]);
  });

  it('wraps around to the first color after the last', () => {
    recordColorUsed(
      ThemeProvider.get().timeline.sessions[ThemeProvider.get().timeline.sessions.length - 1],
    );
    expect(nextDefaultColor()).toBe(ThemeProvider.get().timeline.sessions[0]);
  });

  it('ignores colors not in the palette and treats storage as out-of-range', () => {
    localStorage.setItem(COLOR_STORAGE_KEY, '999');
    expect(ThemeProvider.get().timeline.sessions).toContain(nextDefaultColor());
  });
});

describe('recordColorUsed', () => {
  it('stores the index of the given color', () => {
    recordColorUsed(ThemeProvider.get().timeline.sessions[2]);
    expect(localStorage.getItem(COLOR_STORAGE_KEY)).toBe('2');
  });

  it('does nothing for a color not in the palette', () => {
    recordColorUsed('#notapalette');
    expect(localStorage.getItem(COLOR_STORAGE_KEY)).toBeNull();
  });
});

// --- datetime-local helpers ---

describe('toDatetimeLocal', () => {
  it('returns the first 16 characters (datetime-local format)', () => {
    expect(toDatetimeLocal('2024-01-15T13:30:00')).toBe('2024-01-15T13:30');
  });
});

describe('fromDatetimeLocal', () => {
  it('appends :00 when value is 16 characters', () => {
    expect(fromDatetimeLocal('2024-01-15T13:30')).toBe('2024-01-15T13:30:00');
  });

  it('returns the value unchanged when longer than 16 characters', () => {
    expect(fromDatetimeLocal('2024-01-15T13:30:00')).toBe('2024-01-15T13:30:00');
  });
});

// --- calendar parsing via CalendarProvider ---

describe('CalendarProvider.get().tryParse', () => {
  it('returns a CalendarDate for a valid Golarion ISO string', () => {
    expect(CalendarProvider.get().tryParse('4726-05-04T13:00:00')).not.toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(CalendarProvider.get().tryParse('not-a-date')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(CalendarProvider.get().tryParse('')).toBeNull();
  });

  it('returns null for invalid month 0', () => {
    expect(CalendarProvider.get().tryParse('4726-00-04T13:00:00')).toBeNull();
  });
});

// --- validateSessionBuffer ---

describe('validateSessionBuffer', () => {
  it('returns null for a valid buffer with no sessions', () => {
    expect(validateSessionBuffer(makeBuffer(), [], true)).toBeNull();
  });

  it('returns error when inGameStart is empty', () => {
    const buf = makeBuffer({ inGameStart: '' });
    expect(validateSessionBuffer(buf, [], true)).not.toBeNull();
  });

  it('returns error when inGameStart is invalid', () => {
    const buf = makeBuffer({ inGameStart: 'bad' });
    expect(validateSessionBuffer(buf, [], true)).not.toBeNull();
  });

  it('returns error when inGameEnd is empty', () => {
    const buf = makeBuffer({ inGameEnd: '' });
    expect(validateSessionBuffer(buf, [], true)).not.toBeNull();
  });

  it('returns error when inGameEnd is invalid', () => {
    const buf = makeBuffer({ inGameEnd: 'notadate' });
    expect(validateSessionBuffer(buf, [], true)).not.toBeNull();
  });

  it('returns overlap error when new session overlaps an existing one on the same day', () => {
    const existing = makeSession({ realStart: '2024-01-15T13:00:00' });
    // Same real day, overlapping in-game range
    const buf = makeBuffer({
      inGameStart: '4726-05-04T14:00:00',
      inGameEnd: '4726-05-04T18:00:00',
    });
    expect(validateSessionBuffer(buf, [existing], true)).toMatch(/overlap/i);
  });

  it('does not report overlap when sessions are adjacent (touching endpoints)', () => {
    const existing = makeSession({
      realStart: '2024-01-15T13:00:00',
      inGameStart: '4726-05-04T13:00:00',
      inGameEnd: '4726-05-04T17:00:00',
    });
    // New session starts exactly where existing ends
    const buf = makeBuffer({
      inGameStart: '4726-05-04T17:00:00',
      inGameEnd: '4726-05-04T19:00:00',
    });
    expect(validateSessionBuffer(buf, [existing], true)).toBeNull();
  });

  it('does not report overlap when same day but completely before existing', () => {
    const existing = makeSession({
      realStart: '2024-01-15T13:00:00',
      inGameStart: '4726-05-04T13:00:00',
      inGameEnd: '4726-05-04T17:00:00',
    });
    const buf = makeBuffer({
      inGameStart: '4726-05-04T09:00:00',
      inGameEnd: '4726-05-04T12:00:00',
    });
    expect(validateSessionBuffer(buf, [existing], true)).toBeNull();
  });

  it('does not report overlap for sessions on different real-world days', () => {
    const existing = makeSession({ realStart: '2024-01-14T13:00:00' });
    const buf = makeBuffer({
      realStart: '2024-01-15T13:00:00',
      inGameStart: '4726-05-04T14:00:00',
      inGameEnd: '4726-05-04T18:00:00',
    });
    expect(validateSessionBuffer(buf, [existing], true)).toBeNull();
  });

  it('skips zero-length sessions (inGameStart === inGameEnd) from overlap check', () => {
    const zeroLength = makeSession({
      id: 'zero',
      realStart: '2024-01-15T13:00:00',
      inGameStart: '4726-05-04T13:00:00',
      inGameEnd: '4726-05-04T13:00:00', // zero-length
    });
    // Would overlap if counted, but must be skipped
    const buf = makeBuffer({
      inGameStart: '4726-05-04T12:00:00',
      inGameEnd: '4726-05-04T14:00:00',
    });
    expect(validateSessionBuffer(buf, [zeroLength], true)).toBeNull();
  });

  it('excludes the session being edited from overlap check (isNew=false)', () => {
    const existing = makeSession({ id: 'edit-me', realStart: '2024-01-15T13:00:00' });
    // Editing the same session: overlap with itself should not count
    const buf = makeBuffer({
      id: 'edit-me',
      inGameStart: '4726-05-04T14:00:00',
      inGameEnd: '4726-05-04T18:00:00',
    });
    expect(validateSessionBuffer(buf, [existing], false)).toBeNull();
  });

  it('uses inGameStartSeconds/inGameEndSeconds when present for overlap detection', () => {
    const cal = CalendarProvider.get();
    // Session with precomputed seconds
    const existStart = cal.toEpochSeconds(cal.tryParse('4726-05-04T13:00:00')!);
    const existEnd = cal.toEpochSeconds(cal.tryParse('4726-05-04T17:00:00')!);
    const existing = makeSession({
      realStart: '2024-01-15T13:00:00',
      inGameStart: '4726-05-04T13:00:00',
      inGameEnd: '4726-05-04T17:00:00',
      inGameStartSeconds: existStart,
      inGameEndSeconds: existEnd,
    });
    // Overlapping buffer
    const buf = makeBuffer({
      inGameStart: '4726-05-04T14:00:00',
      inGameEnd: '4726-05-04T18:00:00',
    });
    expect(validateSessionBuffer(buf, [existing], true)).toMatch(/overlap/i);
  });
});

// --- bufferFromSession ---

describe('bufferFromSession', () => {
  it('copies all fields from the session', () => {
    const session = makeSession({ notes: 'hello' });
    const buf = bufferFromSession(session);
    expect(buf.id).toBe('s1');
    expect(buf.inGameStart).toBe('4726-05-04T13:00:00');
    expect(buf.notes).toBe('hello');
    expect(buf.color).toBe('#6b7c5a');
  });

  it('defaults notes to empty string when session.notes is undefined', () => {
    const session = makeSession();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (session as any).notes = undefined;
    const buf = bufferFromSession(session);
    expect(buf.notes).toBe('');
  });
});

// --- emptyBuffer ---

describe('emptyBuffer', () => {
  it('returns a buffer with empty inGameStart/End when no prefill', () => {
    const buf = emptyBuffer();
    expect(buf.inGameStart).toBe('');
    expect(buf.inGameEnd).toBe('');
  });

  it('pre-fills inGameStart/End when prefill is provided', () => {
    const buf = emptyBuffer({ inGameStart: '4726-05-04T13:00', inGameEnd: '4726-05-04T17:00' });
    expect(buf.inGameStart).toBe('4726-05-04T13:00');
    expect(buf.inGameEnd).toBe('4726-05-04T17:00');
  });

  it('picks next default color', () => {
    recordColorUsed(ThemeProvider.get().timeline.sessions[0]);
    const buf = emptyBuffer();
    expect(buf.color).toBe(ThemeProvider.get().timeline.sessions[1]);
  });
});

// --- buildSavedSession ---

describe('buildSavedSession', () => {
  it('generates a new id when isNew=true', () => {
    const saved = buildSavedSession(makeBuffer(), [], true);
    expect(saved.id).toBeTruthy();
  });

  it('preserves the buffer id when isNew=false', () => {
    const buf = makeBuffer({ id: 'keep-me' });
    const saved = buildSavedSession(buf, [], false);
    expect(saved.id).toBe('keep-me');
  });

  it('copies in-game dates and real dates from the buffer', () => {
    const buf = makeBuffer();
    const saved = buildSavedSession(buf, [], true);
    expect(saved.inGameStart).toBe(buf.inGameStart);
    expect(saved.inGameEnd).toBe(buf.inGameEnd);
    expect(saved.realStart).toBe(buf.realStart);
    expect(saved.realEnd).toBe(buf.realEnd);
  });

  it('sets real_date and in_game_start convenience fields', () => {
    const buf = makeBuffer({ realStart: '2024-03-20T09:00:00', inGameStart: '4726-05-04T09:00' });
    const saved = buildSavedSession(buf, [], true);
    expect(saved.real_date).toBe('2024-03-20');
    expect(saved.in_game_start).toBe(buf.inGameStart);
  });

  it('sets inGameStartSeconds and inGameEndSeconds from parsed dates', () => {
    const cal = CalendarProvider.get();
    const buf = makeBuffer({
      inGameStart: '4726-05-04T13:00:00',
      inGameEnd: '4726-05-04T17:00:00',
    });
    const saved = buildSavedSession(buf, [], true);
    const expectedStart = cal.toEpochSeconds(cal.tryParse('4726-05-04T13:00:00')!);
    const expectedEnd = cal.toEpochSeconds(cal.tryParse('4726-05-04T17:00:00')!);
    expect(saved.inGameStartSeconds).toBe(expectedStart);
    expect(saved.inGameEndSeconds).toBe(expectedEnd);
  });

  it('does not set inGameStartSeconds when start date is invalid', () => {
    const buf = makeBuffer({ inGameStart: 'bad-date' });
    const saved = buildSavedSession(buf, [], true);
    expect(saved.inGameStartSeconds).toBeUndefined();
  });

  it('does not set inGameEndSeconds when end date is invalid', () => {
    const buf = makeBuffer({ inGameEnd: 'bad-date' });
    const saved = buildSavedSession(buf, [], true);
    expect(saved.inGameEndSeconds).toBeUndefined();
  });
});
