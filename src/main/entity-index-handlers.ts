import { ipcMain, BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getCampaignPath } from './campaign-state.js';
import { buildEntityIndex, findEntityById, indexSingleEntity } from './entity-index.js';
import { parseNote, stringifyNote } from '../shared/frontmatter.js';

export function registerEntityIndexHandlers() {
  ipcMain.handle('entity:getAll', async () => {
    const campaignPath = getCampaignPath();
    if (!campaignPath) return [];
    try {
      return buildEntityIndex(campaignPath);
    } catch (error) {
      console.error('Failed to get entity index:', error);
      return [];
    }
  });

  ipcMain.handle(
    'entity:updateLabelOverride',
    async (
      _event,
      id: string,
      target: 'tagLabel' | 'linkLabel',
      value: string | null,
    ) => {
      const campaignPath = getCampaignPath();
      if (!campaignPath) return false;

      try {
        const fullPath = findEntityById(id, campaignPath);
        if (!fullPath) return false;

        const content = fs.readFileSync(fullPath, 'utf-8');
        const fallbackTitle = path.basename(fullPath, '.md');
        const { frontmatter, body } = parseNote(content, fallbackTitle);

        const key = target === 'tagLabel' ? 'tagLabelOverride' : 'linkLabelOverride';
        if (value === null) {
          delete frontmatter[key];
        } else {
          frontmatter[key] = value;
        }

        fs.writeFileSync(fullPath, stringifyNote(body, frontmatter), 'utf-8');

        const updatedEntry = indexSingleEntity(fullPath, campaignPath);
        if (updatedEntry) {
          const win = BrowserWindow.getAllWindows()[0];
          win?.webContents.send('entity:indexDelta', { op: 'update', entry: updatedEntry });
        }

        return true;
      } catch (error) {
        console.error('Failed to update label override:', error);
        return false;
      }
    },
  );
}
