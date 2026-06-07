import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getCampaignVersion, setCampaignVersion } from '../campaign-version.js';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tti-migration-version-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe('getCampaignVersion', () => {
  it('returns 0 when settings.json does not exist', () => {
    const dir = makeTmpDir();
    expect(getCampaignVersion(dir)).toBe(0);
  });

  it('returns 0 when settings.json exists but has no version key', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ theme: 'dark-pathfinder' }));
    expect(getCampaignVersion(dir)).toBe(0);
  });

  it('setCampaignVersion roundtrip returns the written value', () => {
    const dir = makeTmpDir();
    setCampaignVersion(dir, 3);
    expect(getCampaignVersion(dir)).toBe(3);
  });

  it('setCampaignVersion preserves other keys such as theme', () => {
    const dir = makeTmpDir();
    const settingsFile = path.join(dir, 'settings.json');
    fs.writeFileSync(settingsFile, JSON.stringify({ theme: 'dark-pathfinder' }));
    setCampaignVersion(dir, 2);
    const obj = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    expect(obj.version).toBe(2);
    expect(obj.theme).toBe('dark-pathfinder');
  });

  it('returns 0 when settings.json contains malformed JSON', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, 'settings.json'), 'not valid json {{{');
    expect(getCampaignVersion(dir)).toBe(0);
  });

  it('returns 0 for non-integer and negative version values', () => {
    const dir = makeTmpDir();
    const settingsFile = path.join(dir, 'settings.json');

    // Float (non-integer)
    fs.writeFileSync(settingsFile, JSON.stringify({ version: 1.5 }));
    expect(getCampaignVersion(dir)).toBe(0);

    // String
    fs.writeFileSync(settingsFile, JSON.stringify({ version: '2' }));
    expect(getCampaignVersion(dir)).toBe(0);

    // Negative integer
    fs.writeFileSync(settingsFile, JSON.stringify({ version: -1 }));
    expect(getCampaignVersion(dir)).toBe(0);

    // null
    fs.writeFileSync(settingsFile, JSON.stringify({ version: null }));
    expect(getCampaignVersion(dir)).toBe(0);
  });
});
