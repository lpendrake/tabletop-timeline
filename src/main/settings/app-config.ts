import { app } from 'electron';
import * as path from 'node:path';
import { readJsonObject, writeJsonObject } from './settings-json.js';

/** Path to the app-wide (not per-campaign) settings file in Electron's userData dir. */
export function configPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

/** Reads the app-wide settings object, or {} if it doesn't exist or is malformed. */
export function getSettings(): Record<string, unknown> {
  return readJsonObject(configPath());
}

/** Writes the app-wide settings object, replacing whatever was there before. */
export function saveSettings(settings: Record<string, unknown>): void {
  try {
    writeJsonObject(configPath(), settings);
  } catch (e) {
    console.error('Failed to save config:', e);
  }
}
