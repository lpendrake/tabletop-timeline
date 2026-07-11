import * as fs from 'node:fs';
import * as path from 'node:path';
import { readJsonObject, writeJsonObject } from './settings-json.js';

export function getCampaignDefaultView(campaignPath: string): string | null {
  try {
    const file = path.join(campaignPath, 'settings.json');
    const obj = readJsonObject(file);
    const value = obj.defaultView;
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

export function setCampaignDefaultView(campaignPath: string, view: string | null): void {
  const file = path.join(campaignPath, 'settings.json');

  if (view === null) {
    // If file doesn't exist, do nothing
    if (!fs.existsSync(file)) {
      return;
    }
    const obj = readJsonObject(file);
    delete obj.defaultView;
    writeJsonObject(file, obj);
    return;
  }

  const obj = readJsonObject(file);
  obj.defaultView = view;
  writeJsonObject(file, obj);
}
