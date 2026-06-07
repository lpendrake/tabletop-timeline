import { CalendarProvider } from '../calendar/provider';
import type { Session } from '../data/types';
import { ThemeProvider } from '../../theme';

export const COLOR_STORAGE_KEY = 'last-gasp:session-color-idx';

export interface SessionBuffer {
  id: string;
  inGameStart: string;
  inGameEnd: string;
  realStart: string;
  realEnd: string;
  color: string;
  notes: string;
}

export type SessionEditorMode =
  | { kind: 'create'; prefill?: { inGameStart: string; inGameEnd: string } }
  | { kind: 'edit'; sessionId: string };

export function nextDefaultColor(): string {
  const colors = ThemeProvider.get().timeline.sessions;
  const stored = localStorage.getItem(COLOR_STORAGE_KEY);
  const last = stored !== null ? parseInt(stored, 10) : -1;
  return colors[(last + 1) % colors.length];
}

export function recordColorUsed(color: string): void {
  const colors = ThemeProvider.get().timeline.sessions;
  const idx = colors.indexOf(color);
  if (idx >= 0) localStorage.setItem(COLOR_STORAGE_KEY, String(idx));
}

export function randomSessionId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export function toDatetimeLocal(isoRealWorld: string): string {
  return isoRealWorld.slice(0, 16);
}

export function fromDatetimeLocal(val: string): string {
  return val.length === 16 ? val + ':00' : val;
}

function sessionToSeconds(s: Session, which: 'start' | 'end'): number {
  const cal = CalendarProvider.get();
  if (which === 'start') {
    if (s.inGameStartSeconds != null) return s.inGameStartSeconds;
    const parsed = cal.tryParse(s.inGameStart);
    return parsed ? cal.toEpochSeconds(parsed) : 0;
  } else {
    if (s.inGameEndSeconds != null) return s.inGameEndSeconds;
    const parsed = cal.tryParse(s.inGameEnd);
    return parsed ? cal.toEpochSeconds(parsed) : 0;
  }
}

export function validateSessionBuffer(
  buf: SessionBuffer,
  existingSessions: Session[],
  isNew: boolean,
): string | null {
  const cal = CalendarProvider.get();
  if (!buf.inGameStart || !cal.tryParse(buf.inGameStart)) {
    return 'Invalid in-game start date.';
  }
  if (!buf.inGameEnd || !cal.tryParse(buf.inGameEnd)) {
    return 'Invalid in-game end date.';
  }
  const realDay = buf.realStart.slice(0, 10);
  const editingId = isNew ? null : buf.id;
  const sameDaySessions = existingSessions.filter(
    (s) => s.id !== editingId && s.realStart.slice(0, 10) === realDay,
  );
  if (sameDaySessions.length > 0) {
    const startParsed = cal.tryParse(buf.inGameStart);
    const endParsed = cal.tryParse(buf.inGameEnd);
    if (startParsed && endParsed) {
      const newStart = cal.toEpochSeconds(startParsed);
      const newEnd = cal.toEpochSeconds(endParsed);
      for (const s of sameDaySessions) {
        const existStart = sessionToSeconds(s, 'start');
        const existEnd = sessionToSeconds(s, 'end');
        if (existStart === existEnd) continue;
        const overlaps = newStart < existEnd && existStart < newEnd;
        if (overlaps) {
          return 'In-game time overlaps another session on the same real-world day.';
        }
      }
    }
  }
  return null;
}

export function bufferFromSession(s: Session): SessionBuffer {
  return {
    id: s.id,
    inGameStart: s.inGameStart,
    inGameEnd: s.inGameEnd,
    realStart: s.realStart,
    realEnd: s.realEnd,
    color: s.color,
    notes: s.notes ?? '',
  };
}

export function emptyBuffer(prefill?: { inGameStart: string; inGameEnd: string }): SessionBuffer {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: '',
    inGameStart: prefill?.inGameStart ?? '',
    inGameEnd: prefill?.inGameEnd ?? '',
    realStart: `${today}T12:00:00`,
    realEnd: `${today}T16:00:00`,
    color: nextDefaultColor(),
    notes: '',
  };
}

export function buildSavedSession(
  buf: SessionBuffer,
  existingSessions: Session[],
  isNew: boolean,
): Session {
  const cal = CalendarProvider.get();
  let id = buf.id;
  if (isNew) {
    do {
      id = randomSessionId();
    } while (existingSessions.some((s) => s.id === id));
  }
  const session: Session = {
    id,
    inGameStart: buf.inGameStart,
    inGameEnd: buf.inGameEnd,
    realStart: buf.realStart,
    realEnd: buf.realEnd,
    color: buf.color,
    notes: buf.notes,
    real_date: buf.realStart.slice(0, 10),
    in_game_start: buf.inGameStart,
  };
  const startParsed = cal.tryParse(buf.inGameStart);
  if (startParsed) session.inGameStartSeconds = cal.toEpochSeconds(startParsed);
  const endParsed = cal.tryParse(buf.inGameEnd);
  if (endParsed) session.inGameEndSeconds = cal.toEpochSeconds(endParsed);
  return session;
}
