import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getCampaignDefaultView, setCampaignDefaultView } from '../default-view-settings.js';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tti-default-view-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe('getCampaignDefaultView', () => {
  it('returns null when no settings.json exists', () => {
    const dir = makeTmpDir();
    expect(getCampaignDefaultView(dir)).toBeNull();
  });

  it('returns null when settings.json lacks defaultView', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ otherKey: 'value' }));
    expect(getCampaignDefaultView(dir)).toBeNull();
  });

  it('round-trips a saved default view', () => {
    const dir = makeTmpDir();
    setCampaignDefaultView(dir, 'notes');
    expect(getCampaignDefaultView(dir)).toBe('notes');
  });

  it('setting null removes the key but preserves others', () => {
    const dir = makeTmpDir();
    const settingsFile = path.join(dir, 'settings.json');
    fs.writeFileSync(settingsFile, JSON.stringify({ defaultView: 'notes', theme: 'x' }));
    setCampaignDefaultView(dir, null);
    expect(getCampaignDefaultView(dir)).toBeNull();
    const obj = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    expect('defaultView' in obj).toBe(false);
    expect(obj.theme).toBe('x');
  });

  it('setting null when no file exists does not throw or create the file', () => {
    const dir = makeTmpDir();
    expect(() => setCampaignDefaultView(dir, null)).not.toThrow();
    expect(fs.existsSync(path.join(dir, 'settings.json'))).toBe(false);
  });
});
