// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  RECENT_NOTES_LIMIT,
  pushRecentNote,
  getRecentNoteIds,
  rememberRecentNote,
  resetRecentNoteIdsForTests,
} from '../relationship-recent-notes';

describe('pushRecentNote (pure MRU)', () => {
  it('inserts a new id at the front', () => {
    expect(pushRecentNote([], 'a')).toEqual(['a']);
    expect(pushRecentNote(['a'], 'b')).toEqual(['b', 'a']);
  });

  it('moves an existing id to the front instead of duplicating it', () => {
    expect(pushRecentNote(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
  });

  it('caps the list at the given limit', () => {
    expect(pushRecentNote(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b']);
  });

  it('defaults to RECENT_NOTES_LIMIT', () => {
    const start = Array.from({ length: RECENT_NOTES_LIMIT }, (_, i) => `n${i}`);
    const next = pushRecentNote(start, 'new');
    expect(next).toHaveLength(RECENT_NOTES_LIMIT);
    expect(next[0]).toBe('new');
  });
});

describe('shared recents store', () => {
  beforeEach(() => {
    resetRecentNoteIdsForTests();
  });

  it('starts empty', () => {
    expect(getRecentNoteIds()).toEqual([]);
  });

  it('remembers a chosen note and reads it back', () => {
    rememberRecentNote('abc1');
    expect(getRecentNoteIds()).toEqual(['abc1']);
  });

  it('is a no-op for a falsy id', () => {
    rememberRecentNote(null);
    rememberRecentNote(undefined);
    rememberRecentNote('');
    expect(getRecentNoteIds()).toEqual([]);
  });

  it('is one shared list — picking in one place is visible from another read, with no per-instance state', () => {
    // Simulates two independent bubble/editor "instances" both reading and
    // writing through the same module-level store (never their own field).
    rememberRecentNote('note-a');
    const seenByInstanceOne = getRecentNoteIds();
    rememberRecentNote('note-b');
    const seenByInstanceTwo = getRecentNoteIds();

    expect(seenByInstanceOne).toEqual(['note-a']);
    expect(seenByInstanceTwo).toEqual(['note-b', 'note-a']);
  });

  it('survives a fresh read after being written — simulating unmount/remount across a view switch', () => {
    rememberRecentNote('note-x');
    // A remounted component only ever calls getRecentNoteIds() again; it
    // never held its own copy that a remount could reset.
    expect(getRecentNoteIds()).toEqual(['note-x']);
  });

  it('persists to localStorage so a later module read picks it back up', () => {
    rememberRecentNote('persisted-1');
    const raw = window.localStorage.getItem('relationship-bubble:recent-note-ids');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual(['persisted-1']);
  });

  it('never throws when localStorage access throws', () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(() => rememberRecentNote('still-works')).not.toThrow();
      expect(getRecentNoteIds()).toEqual(['still-works']);
    } finally {
      window.localStorage.setItem = original;
    }
  });
});
