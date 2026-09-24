// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadLastNoteFolder, saveLastNoteFolder } from '../last-note-folder';

beforeEach(() => {
  localStorage.clear();
});

describe('last note folder', () => {
  it('round-trips per campaign', () => {
    saveLastNoteFolder('/campaign-a', 'factions');
    saveLastNoteFolder('/campaign-b', 'lore/npcs');

    expect(loadLastNoteFolder('/campaign-a')).toBe('factions');
    expect(loadLastNoteFolder('/campaign-b')).toBe('lore/npcs');
  });

  it('returns null when nothing has been saved', () => {
    expect(loadLastNoteFolder('/unknown-campaign')).toBeNull();
  });

  it('survives throwing storage', () => {
    const originalGetItem = localStorage.getItem;
    const originalSetItem = localStorage.setItem;
    localStorage.getItem = () => {
      throw new Error('storage disabled');
    };
    localStorage.setItem = () => {
      throw new Error('storage disabled');
    };

    try {
      expect(loadLastNoteFolder('/campaign-a')).toBeNull();
      expect(() => saveLastNoteFolder('/campaign-a', 'factions')).not.toThrow();
    } finally {
      localStorage.getItem = originalGetItem;
      localStorage.setItem = originalSetItem;
    }
  });
});
