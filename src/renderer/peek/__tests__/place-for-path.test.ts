import { describe, it, expect } from 'vitest';
import { placeForPeekPath } from '../place-for-path';

describe('placeForPeekPath (pure)', () => {
  it('treats notes/… paths as a note', () => {
    expect(placeForPeekPath('notes/npcs/villain.md')).toBe('note');
    expect(placeForPeekPath('notes/index.md')).toBe('note');
  });

  it('treats timeline/… paths as an event', () => {
    expect(placeForPeekPath('timeline/2024-01-01-battle.md')).toBe('event');
  });

  it('defaults to event for any other path', () => {
    expect(placeForPeekPath('assets/pic.png')).toBe('event');
    expect(placeForPeekPath('')).toBe('event');
  });
});
