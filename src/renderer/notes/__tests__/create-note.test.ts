import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../data', () => ({
  notesData: { createNoteFile: vi.fn(), saveNote: vi.fn() },
}));

import { notesData } from '../data';
import { createNote } from '../create-note';
import { MAX_CREATE_ATTEMPTS } from '../domain/unique-filename';

const createNoteFile = notesData.createNoteFile as ReturnType<typeof vi.fn>;
const saveNote = notesData.saveNote as ReturnType<typeof vi.fn>;

beforeEach(() => {
  createNoteFile.mockReset();
  saveNote.mockReset();
});

const campaignPath = '/campaign';

describe('createNote', () => {
  it('writes id + title frontmatter and an H1 body', async () => {
    createNoteFile.mockResolvedValue({ ok: true });

    const result = await createNote({ campaignPath, folder: 'Lore', title: 'Bob the Brave' });

    expect(result.filename).toBe('bob-the-brave.md');
    expect(result.frontmatter).toBe(`id: ${result.id}\ntitle: Bob the Brave`);
    expect(result.body).toBe('# Bob the Brave\n\n');
    expect(createNoteFile).toHaveBeenCalledWith(
      '/campaign/notes/Lore/bob-the-brave.md',
      `---\nid: ${result.id}\ntitle: Bob the Brave\n---\n# Bob the Brave\n\n`,
    );
  });

  it('picks slug-2.md when slug.md exists and never calls saveNote', async () => {
    createNoteFile
      .mockResolvedValueOnce({ ok: false, reason: 'exists' })
      .mockResolvedValueOnce({ ok: true });

    const result = await createNote({ campaignPath, folder: 'Lore', title: 'Bob' });

    expect(result.filename).toBe('bob-2.md');
    expect(createNoteFile).toHaveBeenCalledTimes(2);
    expect(saveNote).not.toHaveBeenCalled();
  });

  it('creates two distinct files when called twice with the same title', async () => {
    // First call: slug.md is free.
    createNoteFile.mockResolvedValueOnce({ ok: true });
    const first = await createNote({ campaignPath, folder: 'Lore', title: 'Bob' });
    expect(first.filename).toBe('bob.md');

    // Second call: slug.md now exists, so it falls through to slug-2.md.
    createNoteFile
      .mockResolvedValueOnce({ ok: false, reason: 'exists' })
      .mockResolvedValueOnce({ ok: true });
    const second = await createNote({ campaignPath, folder: 'Lore', title: 'Bob' });
    expect(second.filename).toBe('bob-2.md');
  });

  it('throws on a non-exists write error without retrying', async () => {
    createNoteFile.mockResolvedValueOnce({ ok: false, reason: 'error', message: 'disk full' });

    await expect(createNote({ campaignPath, folder: 'Lore', title: 'Bob' })).rejects.toThrow(
      'disk full',
    );
    expect(createNoteFile).toHaveBeenCalledTimes(1);
  });

  it('throws after MAX_CREATE_ATTEMPTS', async () => {
    createNoteFile.mockResolvedValue({ ok: false, reason: 'exists' });

    await expect(createNote({ campaignPath, folder: 'Lore', title: 'Bob' })).rejects.toThrow();
    expect(createNoteFile).toHaveBeenCalledTimes(MAX_CREATE_ATTEMPTS);
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
