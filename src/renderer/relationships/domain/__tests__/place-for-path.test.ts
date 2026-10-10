import { describe, it, expect } from 'vitest';
import { placeForPath } from '../place-for-path';

describe('placeForPath (pure)', () => {
  it('treats notes/… paths as a note', () => {
    expect(placeForPath('notes/npcs/villain.md')).toBe('note');
    expect(placeForPath('notes/index.md')).toBe('note');
  });

  it('treats timeline/… paths as an event', () => {
    expect(placeForPath('timeline/2024-01-01-battle.md')).toBe('event');
  });

  it('defaults to event for any other path', () => {
    expect(placeForPath('assets/pic.png')).toBe('event');
    expect(placeForPath('')).toBe('event');
  });
});
