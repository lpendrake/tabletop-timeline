import { ipcMain } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getCampaignPath } from './campaign-state.js';
import { buildEntityIndex, findEntityById } from './entity-index.js';
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
    async (_event, id: string, target: 'tagLabel' | 'linkLabel', value: string | null) => {
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
        // File watcher picks up the write and emits entity:indexDelta, same as all other writes.

        return true;
      } catch (error) {
        console.error('Failed to update label override:', error);
        return false;
      }
    },
  );
}
