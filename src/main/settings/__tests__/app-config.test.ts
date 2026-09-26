import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let userDataDir = '';

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
}));

import { configPath, getSettings, saveSettings } from '../app-config.js';

beforeAll(() => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tti-app-config-test-'));
});

afterEach(() => {
  const file = configPath();
  if (fs.existsSync(file)) fs.rmSync(file);
});

describe('getSettings', () => {
  it('returns {} when config.json does not exist', () => {
    expect(getSettings()).toEqual({});
  });

  it('returns {} when config.json is malformed', () => {
    fs.writeFileSync(configPath(), 'not json');
    expect(getSettings()).toEqual({});
  });

  it('reads back what saveSettings wrote', () => {
    saveSettings({ rootDir: '/campaigns', other: 1 });
    expect(getSettings()).toEqual({ rootDir: '/campaigns', other: 1 });
  });
});

describe('saveSettings', () => {
  it('replaces the whole settings object, not merging with what was there', () => {
    saveSettings({ rootDir: '/campaigns', other: 1 });
    saveSettings({ rootDir: '/other-campaigns' });
    expect(getSettings()).toEqual({ rootDir: '/other-campaigns' });
  });
});
