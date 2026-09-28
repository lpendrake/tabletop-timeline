import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let userDataDir = '';

vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
}));

import { readRootDir } from '../root-dir.js';

beforeAll(() => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tti-root-dir-test-'));
});

afterEach(() => {
  const configFile = path.join(userDataDir, 'config.json');
  if (fs.existsSync(configFile)) fs.rmSync(configFile);
});

describe('readRootDir', () => {
  it('returns null when config.json does not exist', () => {
    expect(readRootDir()).toBeNull();
  });

  it('returns null when config.json has no rootDir', () => {
    fs.writeFileSync(path.join(userDataDir, 'config.json'), JSON.stringify({ other: 1 }));
    expect(readRootDir()).toBeNull();
  });

  it('returns the stored rootDir, matching settings:getRootDir behaviour', () => {
    fs.writeFileSync(
      path.join(userDataDir, 'config.json'),
      JSON.stringify({ rootDir: '/campaigns' }),
    );
    expect(readRootDir()).toBe('/campaigns');
  });

  it('returns null when config.json is malformed', () => {
    fs.writeFileSync(path.join(userDataDir, 'config.json'), 'not json');
    expect(readRootDir()).toBeNull();
  });
});
