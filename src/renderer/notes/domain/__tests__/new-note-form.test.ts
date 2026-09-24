import { describe, it, expect } from 'vitest';
import {
  canSubmit,
  conflictWarningText,
  folderOptions,
  initialFolder,
  NOTES_ROOT_FOLDER,
} from '../new-note-form';

describe('initialFolder', () => {
  it('initialFolder uses the last folder when it still exists', () => {
    expect(initialFolder(['npcs', 'factions/the-house-of-storms'], 'npcs')).toBe('npcs');
  });

  it('initialFolder falls back to the notes root', () => {
    expect(initialFolder(['npcs'], 'locations')).toBe(NOTES_ROOT_FOLDER);
    expect(initialFolder(['npcs'], null)).toBe(NOTES_ROOT_FOLDER);
    expect(initialFolder(['npcs'], NOTES_ROOT_FOLDER)).toBe(NOTES_ROOT_FOLDER);
  });
});

describe('canSubmit', () => {
  it('canSubmit rejects titles with no letters or numbers', () => {
    expect(canSubmit('')).toBe(false);
    expect(canSubmit('  ')).toBe(false);
    expect(canSubmit('!!!')).toBe(false);
    expect(canSubmit('Captain Varr')).toBe(true);
  });
});

describe('folderOptions', () => {
  it('folderOptions lists root first and includes intermediate folders', () => {
    const options = folderOptions(['factions', 'factions/the-house-of-storms']);
    expect(options).toEqual([
      { id: NOTES_ROOT_FOLDER, path: 'notes', label: 'notes/ (root)' },
      { id: 'factions', path: 'factions', label: 'factions' },
      {
        id: 'factions/the-house-of-storms',
        path: 'factions/the-house-of-storms',
        label: 'factions/the-house-of-storms',
      },
    ]);
  });
});

describe('conflictWarningText', () => {
  it('formats the attempted title and folder label', () => {
    expect(conflictWarningText('Bob', 'npcs')).toBe('A note called "Bob" already exists in npcs:');
  });
});
