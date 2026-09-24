import { describe, it, expect } from 'vitest';
import {
  addCreatedNoteToFolderFiles,
  addFolderForCreatedNote,
  folderPathsToOpenForCreatedNote,
} from '../created-note-state';

describe('addCreatedNoteToFolderFiles', () => {
  it('adds a top-level note to a known folder', () => {
    const result = addCreatedNoteToFolderFiles(
      { npcs: [] },
      { id: 'abcd', folder: 'npcs', filename: 'captain-varr.md', title: 'Captain Varr' },
    );

    expect(result).toEqual({
      npcs: [{ id: 'abcd', path: 'captain-varr.md', title: 'Captain Varr', kind: 'note' }],
    });
  });

  it('adds a nested note under its top-level folder', () => {
    const result = addCreatedNoteToFolderFiles(
      { factions: [] },
      {
        id: 'fx01',
        folder: 'factions/the-house-of-storms',
        filename: 'leader.md',
        title: 'Leader',
      },
    );

    expect(result).toEqual({
      factions: [
        { id: 'fx01', path: 'the-house-of-storms/leader.md', title: 'Leader', kind: 'note' },
      ],
    });
  });

  it('replaces an existing entry at the same path instead of duplicating it', () => {
    const folderFiles = {
      npcs: [{ id: 'old', path: 'bob.md', title: 'Old Bob', kind: 'note' as const }],
    };
    const result = addCreatedNoteToFolderFiles(folderFiles, {
      id: 'new1',
      folder: 'npcs',
      filename: 'bob.md',
      title: 'New Bob',
    });

    expect(result?.npcs).toEqual([{ id: 'new1', path: 'bob.md', title: 'New Bob', kind: 'note' }]);
  });

  it('returns null for a notes-root note (unsupported by the sidebar model)', () => {
    const result = addCreatedNoteToFolderFiles(
      {},
      { id: 'abcd', folder: '', filename: 'root-note.md', title: 'Root Note' },
    );

    expect(result).toBeNull();
  });
});

describe('addFolderForCreatedNote', () => {
  it('adds a new top-level folder (sorted) when unseen', () => {
    const result = addFolderForCreatedNote(['npcs'], {
      id: 'fx01',
      folder: 'factions',
      filename: 'x.md',
      title: 'X',
    });

    expect(result).toEqual(['factions', 'npcs']);
  });

  it('leaves the list unchanged when the top-level folder is already known', () => {
    const result = addFolderForCreatedNote(['factions', 'npcs'], {
      id: 'fx01',
      folder: 'factions/the-house-of-storms',
      filename: 'leader.md',
      title: 'Leader',
    });

    expect(result).toEqual(['factions', 'npcs']);
  });

  it('leaves the list unchanged for a notes-root note', () => {
    const result = addFolderForCreatedNote(['npcs'], {
      id: 'abcd',
      folder: '',
      filename: 'root-note.md',
      title: 'Root Note',
    });

    expect(result).toEqual(['npcs']);
  });
});

describe('folderPathsToOpenForCreatedNote', () => {
  it('returns just the top-level folder for a top-level note', () => {
    expect(folderPathsToOpenForCreatedNote('npcs')).toEqual(['npcs']);
  });

  it('returns every intermediate path for a nested folder', () => {
    expect(folderPathsToOpenForCreatedNote('factions/the-house-of-storms')).toEqual([
      'factions',
      'factions/the-house-of-storms',
    ]);
  });

  it('returns no paths for the notes root', () => {
    expect(folderPathsToOpenForCreatedNote('')).toEqual([]);
  });
});
