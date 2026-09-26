import { getSettings } from './app-config.js';

/** Reads the user's chosen workspace root directory from userData/config.json, or null. */
export function readRootDir(): string | null {
  const settings = getSettings();
  const rootDir = settings.rootDir;
  return typeof rootDir === 'string' && rootDir ? rootDir : null;
}
