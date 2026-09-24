import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../create-note', () => ({
  createNote: vi.fn(),
}));

import { createNote } from '../create-note';
import { createNoteInFolder } from '../create-note-in-folder';

const campaignPath = '/campaign';

beforeEach(() => {
  vi.mocked(createNote).mockReset();
});

describe('createNoteInFolder', () => {
  it('does not overwrite an existing file and reports a message for a toast', async () => {
    vi.mocked(createNote).mockResolvedValue({
      status: 'exists',
      existing: { path: 'npcs/bob.md', id: 'xyz1', title: 'Bob' },
    });

    const result = await createNoteInFolder({ campaignPath, folder: 'npcs', name: 'Bob' });

    expect(createNote).toHaveBeenCalledWith({
      campaignPath,
      folder: 'npcs',
      title: 'Bob',
      entityIndex: undefined,
    });
    expect(result).toEqual({
      status: 'exists',
      message: 'A note called "Bob" already exists in npcs',
    });
  });

  it('creates the same content as before, via createNote', async () => {
    const note = {
      id: 'abcd',
      folder: 'npcs',
      filename: 'bob.md',
      title: 'Bob',
      frontmatter: 'id: abcd\ntitle: Bob',
      body: '# Bob\n\n',
    };
    vi.mocked(createNote).mockResolvedValue({ status: 'created', note });

    const result = await createNoteInFolder({ campaignPath, folder: 'npcs', name: 'Bob' });

    expect(result).toEqual({ status: 'created', note });
  });

  it('joins a subdir onto the folder when creating in a nested folder', async () => {
    vi.mocked(createNote).mockResolvedValue({
      status: 'created',
      note: {
        id: 'abcd',
        folder: 'factions/house',
        filename: 'leader.md',
        title: 'Leader',
        frontmatter: '',
        body: '',
      },
    });

    await createNoteInFolder({ campaignPath, folder: 'factions', subdir: 'house', name: 'Leader' });

    expect(createNote).toHaveBeenCalledWith(
      expect.objectContaining({ folder: 'factions/house', title: 'Leader' }),
    );
  });

  it('passes the entity index through to createNote', async () => {
    vi.mocked(createNote).mockResolvedValue({
      status: 'created',
      note: {
        id: 'abcd',
        folder: 'npcs',
        filename: 'bob.md',
        title: 'Bob',
        frontmatter: '',
        body: '',
      },
    });
    const entityIndex = [{ id: 'x', path: 'notes/npcs/x.md', title: 'X', type: 'note' as const }];

    await createNoteInFolder({ campaignPath, folder: 'npcs', name: 'Bob', entityIndex });

    expect(createNote).toHaveBeenCalledWith(expect.objectContaining({ entityIndex }));
  });

  it('returns null and never calls createNote when the name is blank', async () => {
    const result = await createNoteInFolder({ campaignPath, folder: 'npcs', name: '   ' });

    expect(result).toBeNull();
    expect(createNote).not.toHaveBeenCalled();
  });
});
