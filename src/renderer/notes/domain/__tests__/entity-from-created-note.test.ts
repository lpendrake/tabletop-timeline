import { describe, it, expect } from 'vitest';
import { entityFromCreatedNote } from '../entity-from-created-note';
import { resolveLinkById } from '../link-resolution';

describe('entityFromCreatedNote', () => {
  it('builds an index entry that resolves the link', () => {
    const entry = entityFromCreatedNote({
      id: 'abcd',
      folder: 'npcs',
      filename: 'captain-varr.md',
      title: 'Captain Varr',
      frontmatter: 'id: abcd\ntitle: Captain Varr',
      body: '# Captain Varr\n\n',
    });

    expect(entry).toEqual({
      id: 'abcd',
      path: 'notes/npcs/captain-varr.md',
      title: 'Captain Varr',
      type: 'note',
    });

    const resolved = resolveLinkById([entry], 'abcd');
    expect(resolved).toMatchObject({ kind: 'note', folder: 'npcs', path: 'captain-varr.md' });
  });

  it('builds a root-level path when folder is empty', () => {
    const entry = entityFromCreatedNote({
      id: 'zzzz',
      folder: '',
      filename: 'root-note.md',
      title: 'Root Note',
      frontmatter: '',
      body: '',
    });

    expect(entry.path).toBe('notes/root-note.md');
  });

  it('builds a nested path for a nested folder', () => {
    const entry = entityFromCreatedNote({
      id: 'fx01',
      folder: 'factions/the-house-of-storms',
      filename: 'leader.md',
      title: 'Leader',
      frontmatter: '',
      body: '',
    });

    expect(entry.path).toBe('notes/factions/the-house-of-storms/leader.md');
  });
});
