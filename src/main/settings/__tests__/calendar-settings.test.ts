import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getCampaignCalendar, setCampaignCalendar } from '../calendar-settings.js';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tti-calendar-settings-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe('getCampaignCalendar', () => {
  it('returns null when no settings.json exists', () => {
    const dir = makeTmpDir();
    expect(getCampaignCalendar(dir)).toBeNull();
  });

  it('returns null when settings.json lacks the calendar key', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ otherKey: 'value' }));
    expect(getCampaignCalendar(dir)).toBeNull();
  });

  it('returns null when the calendar key is an empty string', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ calendar: '' }));
    expect(getCampaignCalendar(dir)).toBeNull();
  });

  it('returns the value after setCampaignCalendar roundtrip', () => {
    const dir = makeTmpDir();
    setCampaignCalendar(dir, 'grg1');
    expect(getCampaignCalendar(dir)).toBe('grg1');
  });

  it('returns null when settings.json is malformed JSON', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, 'settings.json'), 'not valid json {{{');
    expect(getCampaignCalendar(dir)).toBeNull();
  });
});

describe('setCampaignCalendar', () => {
  it('creates settings.json and writes the calendar key', () => {
    const dir = makeTmpDir();
    setCampaignCalendar(dir, 'grg1');
    const obj = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf-8'));
    expect(obj.calendar).toBe('grg1');
  });

  it('preserves unrelated keys when writing', () => {
    const dir = makeTmpDir();
    const settingsFile = path.join(dir, 'settings.json');
    fs.writeFileSync(settingsFile, JSON.stringify({ someOtherKey: 'preserve-me' }, null, 2));
    setCampaignCalendar(dir, 'grg1');
    const obj = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    expect(obj.calendar).toBe('grg1');
    expect(obj.someOtherKey).toBe('preserve-me');
  });

  it('null removes the calendar key while preserving other keys', () => {
    const dir = makeTmpDir();
    const settingsFile = path.join(dir, 'settings.json');
    fs.writeFileSync(settingsFile, JSON.stringify({ calendar: 'grg1', otherKey: 'keep' }));
    setCampaignCalendar(dir, null);
    expect(getCampaignCalendar(dir)).toBeNull();
    const obj = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    expect(obj.otherKey).toBe('keep');
    expect('calendar' in obj).toBe(false);
  });

  it('null does not throw and does not create the file when no file exists', () => {
    const dir = makeTmpDir();
    expect(() => setCampaignCalendar(dir, null)).not.toThrow();
    expect(fs.existsSync(path.join(dir, 'settings.json'))).toBe(false);
  });
});
