import { describe, it, expect } from 'vitest';
import {
  addCreatedNoteToFolderFiles,
  folderPathsToOpenForCreatedNote,
} from '../created-note-state';

describe('addCreatedNoteToFolderFiles', () => {
  it('adds a top-level note to a known folder', () => {
    const state = { folders: ['npcs'], folderFiles: { npcs: [] } };
    const result = addCreatedNoteToFolderFiles(state, {
      id: 'abcd',
      folder: 'npcs',
      filename: 'captain-varr.md',
      title: 'Captain Varr',
    });

    expect(result).toEqual({
      folders: ['npcs'],
      folderFiles: {
        npcs: [{ id: 'abcd', path: 'captain-varr.md', title: 'Captain Varr', kind: 'note' }],
      },
    });
  });

  it('adds a nested note under its top-level folder', () => {
    const state = { folders: ['factions'], folderFiles: { factions: [] } };
    const result = addCreatedNoteToFolderFiles(state, {
      id: 'fx01',
      folder: 'factions/the-house-of-storms',
      filename: 'leader.md',
      title: 'Leader',
    });

    expect(result).toEqual({
      folders: ['factions'],
      folderFiles: {
        factions: [
          { id: 'fx01', path: 'the-house-of-storms/leader.md', title: 'Leader', kind: 'note' },
        ],
      },
    });
  });

  it('adds a new top-level folder to `folders` (sorted) when unseen', () => {
    const state = { folders: ['npcs'], folderFiles: {} };
    const result = addCreatedNoteToFolderFiles(state, {
      id: 'fx01',
      folder: 'factions',
      filename: 'x.md',
      title: 'X',
    });

    expect(result?.folders).toEqual(['factions', 'npcs']);
  });

  it('replaces an existing entry at the same path instead of duplicating it', () => {
    const state = {
      folders: ['npcs'],
      folderFiles: {
        npcs: [{ id: 'old', path: 'bob.md', title: 'Old Bob', kind: 'note' as const }],
      },
    };
    const result = addCreatedNoteToFolderFiles(state, {
      id: 'new1',
      folder: 'npcs',
      filename: 'bob.md',
      title: 'New Bob',
    });

    expect(result?.folderFiles.npcs).toEqual([
      { id: 'new1', path: 'bob.md', title: 'New Bob', kind: 'note' },
    ]);
  });

  it('returns null for a notes-root note (unsupported by the sidebar model)', () => {
    const state = { folders: [], folderFiles: {} };
    const result = addCreatedNoteToFolderFiles(state, {
      id: 'abcd',
      folder: '',
      filename: 'root-note.md',
      title: 'Root Note',
    });

    expect(result).toBeNull();
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
