import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../data', () => ({
  notesData: { listFolder: vi.fn() },
}));

import { notesData } from '../data';
import { listNoteFolders } from '../list-note-folders';

const listFolder = notesData.listFolder as ReturnType<typeof vi.fn>;

beforeEach(() => listFolder.mockReset());

const campaignPath = '/campaign';
const notesRoot = '/campaign/notes';

describe('listNoteFolders', () => {
  it('includes intermediate folders', async () => {
    listFolder.mockImplementation(async (p: string) => {
      if (p === notesRoot) return [{ name: 'factions', isDirectory: true }];
      if (p === `${notesRoot}/factions`)
        return [{ name: 'the-house-of-storms', isDirectory: true }];
      if (p === `${notesRoot}/factions/the-house-of-storms`)
        return [{ name: 'spies', isDirectory: true }];
      if (p === `${notesRoot}/factions/the-house-of-storms/spies`) return [];
      return [];
    });

    const result = await listNoteFolders(campaignPath);

    expect(result).toEqual([
      'factions',
      'factions/the-house-of-storms',
      'factions/the-house-of-storms/spies',
    ]);
  });

  it('skips assets and hidden folders', async () => {
    listFolder.mockImplementation(async (p: string) => {
      if (p === notesRoot) {
        return [
          { name: 'assets', isDirectory: true },
          { name: '.git', isDirectory: true },
          { name: 'lore', isDirectory: true },
          { name: 'note.md', isDirectory: false },
        ];
      }
      if (p === `${notesRoot}/lore`) return [];
      return [];
    });

    const result = await listNoteFolders(campaignPath);

    expect(result).toEqual(['lore']);
  });

  it('tolerates a listFolder failure on a subfolder', async () => {
    listFolder.mockImplementation(async (p: string) => {
      if (p === notesRoot) {
        return [
          { name: 'bad', isDirectory: true },
          { name: 'good', isDirectory: true },
        ];
      }
      if (p === `${notesRoot}/bad`) throw new Error('permission denied');
      if (p === `${notesRoot}/good`) return [];
      return [];
    });

    const result = await listNoteFolders(campaignPath);

    expect(result).toEqual(['bad', 'good']);
  });

  it('returns an empty array for a campaign with no folders', async () => {
    listFolder.mockResolvedValue([]);

    const result = await listNoteFolders(campaignPath);

    expect(result).toEqual([]);
  });
});
