import { ipcMain } from 'electron';
import { getCampaignPath } from './campaign-state.js';
import { windowManager } from './windowManager.js';
import { getRelationshipsStore } from './relationships-store.js';
import type { LedgersAs } from './relationships-store.js';
import { readRootDir } from './settings/root-dir.js';
import { addOption, readTrackLibrary } from './settings/relationship-tracks.js';
import {
  getDefaultReputationHolder,
  setDefaultReputationHolder,
} from './settings/relationship-settings.js';

export function registerRelationshipsIpcHandlers() {
  ipcMain.handle('relationships:getLedgers', (_event, entityId: string, as: LedgersAs) => {
    return getRelationshipsStore().ledgersFor(entityId, as);
  });

  ipcMain.handle('relationships:getAllLedgers', () => {
    return getRelationshipsStore().ledgers();
  });

  ipcMain.handle('relationships:getTracks', () => {
    const rootDir = readRootDir();
    if (!rootDir) return { custom: [], optionAdditions: {} };
    return readTrackLibrary(rootDir);
  });

  ipcMain.handle(
    'relationships:addOption',
    (_event, trackId: string, input: { label: string; mutual: boolean }) => {
      const rootDir = readRootDir();
      if (!rootDir) return { ok: false, reason: 'unknown-track' as const };

      const result = addOption(rootDir, trackId, input);
      if (result.ok) {
        getRelationshipsStore().setLibrary(result.library);
        windowManager.getMainWindow()?.webContents.send('relationships:changed', { paths: [] });
      }
      return result;
    },
  );

  ipcMain.handle('relationships:getInvalid', () => {
    return getRelationshipsStore().invalid();
  });

  ipcMain.handle('relationships:getDirectives', (_event, paths: string[]) => {
    return getRelationshipsStore().directivesIn(paths);
  });

  ipcMain.handle('relationships:getDefaultHolder', () => {
    const campaignPath = getCampaignPath();
    if (!campaignPath) return null;
    return getDefaultReputationHolder(campaignPath);
  });

  ipcMain.handle('relationships:setDefaultHolder', (_event, id: string | null) => {
    const campaignPath = getCampaignPath();
    if (!campaignPath) return;
    setDefaultReputationHolder(campaignPath, id);
  });
}
