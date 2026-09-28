import * as fs from 'node:fs';
import * as path from 'node:path';
import { readJsonObject, writeJsonObject } from './settings-json.js';

export function getDefaultReputationHolder(campaignPath: string): string | null {
  try {
    const file = path.join(campaignPath, 'settings.json');
    const obj = readJsonObject(file);
    const value = obj.defaultReputationHolder;
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function setDefaultReputationHolder(campaignPath: string, id: string | null): void {
  const file = path.join(campaignPath, 'settings.json');

  if (id === null) {
    if (!fs.existsSync(file)) return;
    const obj = readJsonObject(file);
    delete obj.defaultReputationHolder;
    writeJsonObject(file, obj);
    return;
  }

  const obj = readJsonObject(file);
  obj.defaultReputationHolder = id;
  writeJsonObject(file, obj);
}
