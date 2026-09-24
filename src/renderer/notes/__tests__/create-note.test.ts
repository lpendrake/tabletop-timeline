import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../data', () => ({
  notesData: { createNoteFile: vi.fn(), saveNote: vi.fn() },
}));

import { notesData } from '../data';
import { createNote } from '../create-note';

const createNoteFile = notesData.createNoteFile as ReturnType<typeof vi.fn>;
const saveNote = notesData.saveNote as ReturnType<typeof vi.fn>;

beforeEach(() => {
  createNoteFile.mockReset();
  saveNote.mockReset();
});

const campaignPath = '/campaign';

describe('createNote', () => {
  it('returns created on success', async () => {
    createNoteFile.mockResolvedValue({ ok: true });

    const result = await createNote({ campaignPath, folder: 'Lore', title: 'Bob the Brave' });

    expect(result.status).toBe('created');
    if (result.status !== 'created') throw new Error('expected created');
    expect(result.note.filename).toBe('bob-the-brave.md');
    expect(result.note.frontmatter).toBe(`id: ${result.note.id}\ntitle: Bob the Brave`);
    expect(result.note.body).toBe('# Bob the Brave\n\n');
    expect(createNoteFile).toHaveBeenCalledWith(
      '/campaign/notes/Lore/bob-the-brave.md',
      `---\nid: ${result.note.id}\ntitle: Bob the Brave\n---\n# Bob the Brave\n\n`,
    );
  });

  it('reports an existing note using the entity index', async () => {
    createNoteFile.mockResolvedValueOnce({ ok: false, reason: 'exists' });

    const result = await createNote({
      campaignPath,
      folder: 'Lore',
      title: 'Bob',
      entityIndex: [{ id: 'xyz1', path: 'notes/Lore/bob.md', title: 'Bob', type: 'note' }],
    });

    expect(createNoteFile).toHaveBeenCalledTimes(1);
    expect(saveNote).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'exists',
      existing: { path: 'Lore/bob.md', id: 'xyz1', title: 'Bob' },
    });
  });

  it("falls back to the filename when the existing note isn't indexed", async () => {
    createNoteFile.mockResolvedValueOnce({ ok: false, reason: 'exists' });

    const result = await createNote({ campaignPath, folder: 'Lore', title: 'Bob' });

    expect(result).toEqual({
      status: 'exists',
      existing: { path: 'Lore/bob.md', id: null, title: 'bob' },
    });
  });

  it('throws on a non-exists write error', async () => {
    createNoteFile.mockResolvedValueOnce({ ok: false, reason: 'error', message: 'disk full' });

    await expect(createNote({ campaignPath, folder: 'Lore', title: 'Bob' })).rejects.toThrow(
      'disk full',
    );
    expect(createNoteFile).toHaveBeenCalledTimes(1);
  });

  it('writes to the notes root when folder is empty', async () => {
    createNoteFile.mockResolvedValue({ ok: true });

    await createNote({ campaignPath, folder: '', title: 'Bob' });

    expect(createNoteFile).toHaveBeenCalledWith('/campaign/notes/bob.md', expect.any(String));
  });

  it('throws when the title has no letters or numbers', async () => {
    await expect(createNote({ campaignPath, folder: '', title: '   !!! ' })).rejects.toThrow(
      'Title must contain letters or numbers',
    );
    expect(createNoteFile).not.toHaveBeenCalled();
  });
});
