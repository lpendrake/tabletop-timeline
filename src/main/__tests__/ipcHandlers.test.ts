import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn),
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
  app: {
    getPath: vi.fn(() => os.tmpdir()),
    getVersion: vi.fn(() => '0.0.0'),
  },
  shell: {
    openExternal: vi.fn(),
    showItemInFolder: vi.fn(),
    trashItem: vi.fn(),
  },
}));

vi.mock('electron-updater', () => ({
  default: {
    autoUpdater: {
      on: vi.fn(),
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
    },
  },
}));

vi.mock('../timelineIpcHandlers.js', () => ({
  registerTimelineIpcHandlers: vi.fn(),
}));

vi.mock('../entity-index-handlers.js', () => ({
  registerEntityIndexHandlers: vi.fn(),
}));

import { registerIpcHandlers } from '../ipcHandlers.js';
import { LATEST_VERSION } from '../migration/registry.js';
import { getCampaignVersion } from '../migration/campaign-version.js';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tti-ipc-test-'));
  tmpDirs.push(dir);
  return dir;
}

beforeEach(() => {
  handlers.clear();
  registerIpcHandlers();
});

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe('campaign:create IPC handler', () => {
  it('creates the campaign folder structure and returns success', async () => {
    const rootDir = makeTmpDir();
    const create = handlers.get('campaign:create')!;

    const result = (await create({}, rootDir, 'My Campaign', 'A description')) as {
      success: boolean;
      path?: string;
    };

    expect(result.success).toBe(true);
    expect(result.path).toBeDefined();

    const campaignPath = result.path!;
    expect(fs.existsSync(path.join(campaignPath, 'notes'))).toBe(true);
    expect(fs.existsSync(path.join(campaignPath, 'timeline'))).toBe(true);
    expect(fs.existsSync(path.join(campaignPath, 'relationships'))).toBe(true);
  });

  it('writes campaign.md with id, name and description frontmatter', async () => {
    const rootDir = makeTmpDir();
    const create = handlers.get('campaign:create')!;

    const result = (await create({}, rootDir, 'Hero Quest', 'Epic adventure')) as {
      success: boolean;
      path?: string;
    };

    expect(result.success).toBe(true);

    const campaignMd = fs.readFileSync(path.join(result.path!, 'campaign.md'), 'utf-8');
    expect(campaignMd).toContain('name: Hero Quest');
    expect(campaignMd).toContain('description: Epic adventure');
    expect(campaignMd).toMatch(/^id: \S+/m);
  });

  it('writes timeline/state.json with empty in_game_now and campaign_start', async () => {
    const rootDir = makeTmpDir();
    const create = handlers.get('campaign:create')!;

    const result = (await create({}, rootDir, 'State Campaign', '')) as {
      success: boolean;
      path?: string;
    };

    expect(result.success).toBe(true);

    const stateJson = JSON.parse(
      fs.readFileSync(path.join(result.path!, 'timeline', 'state.json'), 'utf-8'),
    );
    expect(stateJson).toEqual({ in_game_now: '', campaign_start: '' });
  });

  it('stamps the new campaign with LATEST_VERSION', async () => {
    const rootDir = makeTmpDir();
    const create = handlers.get('campaign:create')!;

    const result = (await create({}, rootDir, 'Versioned Campaign', '')) as {
      success: boolean;
      path?: string;
    };

    expect(result.success).toBe(true);
    expect(getCampaignVersion(result.path!)).toBe(LATEST_VERSION);
  });

  it('refuses to create a campaign whose folder already exists', async () => {
    const rootDir = makeTmpDir();
    const create = handlers.get('campaign:create')!;

    const first = (await create({}, rootDir, 'Duplicate', 'first time')) as {
      success: boolean;
      path?: string;
    };
    expect(first.success).toBe(true);

    const second = (await create({}, rootDir, 'Duplicate', 'second attempt')) as {
      success: boolean;
      error?: string;
    };
    expect(second.success).toBe(false);

    // Ensure the original campaign.md was not overwritten
    const campaignMd = fs.readFileSync(path.join(first.path!, 'campaign.md'), 'utf-8');
    expect(campaignMd).toContain('first time');
    expect(campaignMd).not.toContain('second attempt');
  });
});
