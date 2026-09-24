import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../create-note', () => ({
  createNote: vi.fn(),
}));
vi.mock('../list-note-folders', () => ({
  listNoteFolders: vi.fn(),
}));
vi.mock('../last-note-folder', () => ({
  loadLastNoteFolder: vi.fn(),
  saveLastNoteFolder: vi.fn(),
}));
vi.mock('../show-new-note-dialog', () => ({
  showNewNoteDialog: vi.fn(),
}));

import { runNewNoteFromEditor } from '../new-note-from-editor';
import { createNote } from '../create-note';
import { listNoteFolders } from '../list-note-folders';
import { loadLastNoteFolder, saveLastNoteFolder } from '../last-note-folder';
import { showNewNoteDialog } from '../show-new-note-dialog';

const CAMPAIGN = '/campaign';

function makeCtx(selectedText = '', overrides: Partial<Record<string, unknown>> = {}) {
  return {
    view: { focus: vi.fn() },
    from: 0,
    to: selectedText.length,
    selectedText,
    replaceRange: vi.fn(),
    ...overrides,
  } as unknown as Parameters<typeof runNewNoteFromEditor>[0];
}

beforeEach(() => {
  vi.mocked(listNoteFolders).mockResolvedValue(['npcs', 'factions']);
  vi.mocked(loadLastNoteFolder).mockReturnValue(null);
  vi.mocked(createNote).mockReset();
  vi.mocked(showNewNoteDialog).mockReset();
  vi.mocked(saveLastNoteFolder).mockReset();
});

describe('runNewNoteFromEditor', () => {
  it('creates the note in the chosen folder and replaces the selection with the link', async () => {
    vi.mocked(showNewNoteDialog).mockResolvedValue({
      id: 'abcd',
      folder: 'npcs',
      filename: 'captain-varr.md',
      title: 'Captain Varr',
      frontmatter: 'id: abcd\ntitle: Captain Varr',
      body: '# Captain Varr\n\n',
    });

    const ctx = makeCtx('Captain Varr');
    const result = await runNewNoteFromEditor(ctx, { campaignPath: CAMPAIGN });

    expect(vi.mocked(showNewNoteDialog).mock.calls[0][0]).toMatchObject({
      initialTitle: 'Captain Varr',
      folders: ['npcs', 'factions'],
    });
    expect(ctx.replaceRange).toHaveBeenCalledWith('[[abcd]]');
    expect(result?.id).toBe('abcd');
  });

  it('wires a `create` callback through to createNote with the campaign path and existing ids', async () => {
    vi.mocked(showNewNoteDialog).mockResolvedValue(null);
    const existingIds = new Set(['a']);

    const ctx = makeCtx('');
    await runNewNoteFromEditor(ctx, { campaignPath: CAMPAIGN, existingIds });

    const { create } = vi.mocked(showNewNoteDialog).mock.calls[0][0];
    vi.mocked(createNote).mockResolvedValue({ status: 'created', note: {} as never });
    await create({ title: 'Bob', folder: 'npcs' });

    expect(createNote).toHaveBeenCalledWith({
      title: 'Bob',
      folder: 'npcs',
      campaignPath: CAMPAIGN,
      existingIds,
    });
  });

  it('defaults the folder to the last folder used, else the notes root', async () => {
    vi.mocked(loadLastNoteFolder).mockReturnValue('factions');
    vi.mocked(showNewNoteDialog).mockResolvedValue(null);

    const ctx = makeCtx('');
    await runNewNoteFromEditor(ctx, { campaignPath: CAMPAIGN });

    expect(vi.mocked(showNewNoteDialog).mock.calls[0][0]).toMatchObject({
      initialFolder: 'factions',
    });

    vi.mocked(loadLastNoteFolder).mockReturnValue('nonexistent-folder');
    await runNewNoteFromEditor(ctx, { campaignPath: CAMPAIGN });
    expect(vi.mocked(showNewNoteDialog).mock.calls[1][0]).toMatchObject({ initialFolder: '' });
  });

  it('saves the chosen folder as the last folder', async () => {
    vi.mocked(showNewNoteDialog).mockResolvedValue({
      id: 'fx01',
      folder: 'factions',
      filename: 'faction-x.md',
      title: 'Faction X',
      frontmatter: '',
      body: '',
    });

    const ctx = makeCtx('');
    await runNewNoteFromEditor(ctx, { campaignPath: CAMPAIGN });

    expect(saveLastNoteFolder).toHaveBeenCalledWith(CAMPAIGN, 'factions');
  });

  it('cancel leaves the text untouched and refocuses the editor', async () => {
    vi.mocked(showNewNoteDialog).mockResolvedValue(null);

    const ctx = makeCtx('some text');
    const result = await runNewNoteFromEditor(ctx, { campaignPath: CAMPAIGN });

    expect(result).toBeNull();
    expect(ctx.replaceRange).not.toHaveBeenCalled();
    expect(ctx.view.focus).toHaveBeenCalled();
  });

  it('inserts the link only after a successful create — a conflict that is then cancelled leaves the text untouched', async () => {
    // The dialog handles the "exists" conflict internally (showing its own
    // warning); from here it only ever resolves with a created note or null.
    vi.mocked(showNewNoteDialog).mockResolvedValue(null);

    const ctx = makeCtx('Bad');
    const result = await runNewNoteFromEditor(ctx, { campaignPath: CAMPAIGN });

    expect(result).toBeNull();
    expect(ctx.replaceRange).not.toHaveBeenCalled();
    expect(ctx.view.focus).toHaveBeenCalled();
  });

  it('multi-line selection does not become the title', async () => {
    vi.mocked(showNewNoteDialog).mockResolvedValue(null);

    const ctx = makeCtx('line one\nline two');
    await runNewNoteFromEditor(ctx, { campaignPath: CAMPAIGN });

    expect(vi.mocked(showNewNoteDialog).mock.calls[0][0]).toMatchObject({ initialTitle: '' });
  });
});
