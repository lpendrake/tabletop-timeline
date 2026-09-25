import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

function configPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

/** Reads the user's chosen workspace root directory from userData/config.json, or null. */
export function readRootDir(): string | null {
  try {
    const file = configPath();
    if (fs.existsSync(file)) {
      const settings = JSON.parse(fs.readFileSync(file, 'utf-8'));
      return settings.rootDir || null;
    }
  } catch (e) {
    console.error('Failed to read config:', e);
  }
  return null;
}
