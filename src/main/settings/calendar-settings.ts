import * as fs from 'node:fs';
import * as path from 'node:path';
import { readJsonObject, writeJsonObject } from './settings-json.js';

export function getCampaignCalendar(campaignPath: string): string | null {
  try {
    const file = path.join(campaignPath, 'settings.json');
    const obj = readJsonObject(file);
    const value = obj.calendar;
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

export function setCampaignCalendar(campaignPath: string, calendarId: string | null): void {
  const file = path.join(campaignPath, 'settings.json');

  if (calendarId === null) {
    // If file doesn't exist, do nothing
    if (!fs.existsSync(file)) {
      return;
    }
    const obj = readJsonObject(file);
    delete obj.calendar;
    writeJsonObject(file, obj);
    return;
  }

  const obj = readJsonObject(file);
  obj.calendar = calendarId;
  writeJsonObject(file, obj);
}
