import { describe, it, expect } from 'vitest';
import { existingNoteFromIndex } from '../existing-note-from-index';

describe('existingNoteFromIndex', () => {
  it('returns the indexed id/title when the note is in the entity index', () => {
    const entityIndex = [
      { id: 'xyz1', path: 'notes/Lore/bob.md', title: 'Bob', type: 'note' as const },
    ];

    const result = existingNoteFromIndex(entityIndex, 'notes/Lore/bob.md', 'bob.md');

    expect(result).toEqual({ id: 'xyz1', title: 'Bob' });
  });

  it('falls back to id null and the filename without .md when not indexed', () => {
    const result = existingNoteFromIndex([], 'notes/Lore/bob.md', 'bob.md');

    expect(result).toEqual({ id: null, title: 'bob' });
  });

  it('falls back the same way when no entity index is given', () => {
    const result = existingNoteFromIndex(undefined, 'notes/Lore/bob.md', 'bob.md');

    expect(result).toEqual({ id: null, title: 'bob' });
  });
});
