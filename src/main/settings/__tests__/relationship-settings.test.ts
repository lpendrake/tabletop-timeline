import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  getDefaultReputationHolder,
  setDefaultReputationHolder,
} from '../relationship-settings.js';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tti-rep-holder-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe('default reputation holder settings', () => {
  it('returns null when no settings.json exists', () => {
    const dir = makeTmpDir();
    expect(getDefaultReputationHolder(dir)).toBeNull();
  });

  it('round-trips get/set via settings.json', () => {
    const dir = makeTmpDir();
    setDefaultReputationHolder(dir, 'a1b2');
    expect(getDefaultReputationHolder(dir)).toBe('a1b2');

    const obj = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf-8'));
    expect(obj.defaultReputationHolder).toBe('a1b2');
  });

  it('setting null removes the key but preserves other settings', () => {
    const dir = makeTmpDir();
    const settingsFile = path.join(dir, 'settings.json');
    fs.writeFileSync(
      settingsFile,
      JSON.stringify({ defaultReputationHolder: 'a1b2', calendar: 'glrn' }),
    );
    setDefaultReputationHolder(dir, null);
    expect(getDefaultReputationHolder(dir)).toBeNull();
    const obj = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    expect('defaultReputationHolder' in obj).toBe(false);
    expect(obj.calendar).toBe('glrn');
  });

  it('setting null when no file exists does not throw or create the file', () => {
    const dir = makeTmpDir();
    expect(() => setDefaultReputationHolder(dir, null)).not.toThrow();
    expect(fs.existsSync(path.join(dir, 'settings.json'))).toBe(false);
  });
});
