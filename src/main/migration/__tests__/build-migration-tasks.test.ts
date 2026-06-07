import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildMigrationTasks } from '../build-migration-tasks.js';
import { getCampaignVersion, setCampaignVersion } from '../campaign-version.js';
import { sampleMigration } from '../migrations/0001-sample-migration.js';
import type { Migration } from '../migration.js';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tti-migration-tasks-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

function makeOnProgress() {
  return vi.fn<(completed: number, total: number) => void>();
}

function noopMigration(name: string, targetVersion: number): Migration {
  return {
    name,
    targetVersion,
    run: (_campaignPath, onProgress) => {
      onProgress(1, 1);
      return 'did a thing';
    },
  };
}

describe('buildMigrationTasks', () => {
  it('returns all migrations pending (ascending order) for a v0 campaign', () => {
    const dir = makeTmpDir();

    // Supply migrations out of order to confirm they are sorted ascending
    const migrations: Migration[] = [
      noopMigration('Migration C', 3),
      noopMigration('Migration A', 1),
      noopMigration('Migration B', 2),
    ];

    const tasks = buildMigrationTasks(dir, migrations);

    expect(tasks).toHaveLength(3);
    expect(tasks[0].name).toBe('Migration A');
    expect(tasks[1].name).toBe('Migration B');
    expect(tasks[2].name).toBe('Migration C');
  });

  it('returns [] for an up-to-date campaign and leaves settings.json untouched', () => {
    const dir = makeTmpDir();
    setCampaignVersion(dir, 5);
    const settingsFile = path.join(dir, 'settings.json');
    const beforeBytes = fs.readFileSync(settingsFile);

    const migrations: Migration[] = [
      noopMigration('Migration A', 3),
      noopMigration('Migration B', 5),
    ];

    const tasks = buildMigrationTasks(dir, migrations);

    expect(tasks).toHaveLength(0);
    expect(fs.readFileSync(settingsFile)).toEqual(beforeBytes);
  });

  it('returns [] and does not create settings.json when no migrations exist', () => {
    const dir = makeTmpDir();
    const settingsFile = path.join(dir, 'settings.json');

    const tasks = buildMigrationTasks(dir, []);

    expect(tasks).toHaveLength(0);
    expect(fs.existsSync(settingsFile)).toBe(false);
  });

  it('running a task bumps the campaign version to that migration targetVersion', async () => {
    const dir = makeTmpDir();
    const migrations: Migration[] = [noopMigration('Migration A', 7)];

    const tasks = buildMigrationTasks(dir, migrations);
    expect(tasks).toHaveLength(1);

    await tasks[0].task(makeOnProgress());

    expect(getCampaignVersion(dir)).toBe(7);
  });

  it('running a task returns the formatted summary line', async () => {
    const dir = makeTmpDir();
    const migrations: Migration[] = [noopMigration('Migration A', 7)];

    const tasks = buildMigrationTasks(dir, migrations);
    const summary = await tasks[0].task(makeOnProgress());

    expect(summary).toBe('Ran migration 7: Migration A\nresult: did a thing');
  });

  it('when an earlier migration succeeds and a later one throws, version stays at the last success', async () => {
    const dir = makeTmpDir();

    const throwingMigration: Migration = {
      name: 'Failing migration',
      targetVersion: 2,
      run: () => {
        throw new Error('conversion impossible');
      },
    };

    const migrations: Migration[] = [noopMigration('Migration A', 1), throwingMigration];

    const tasks = buildMigrationTasks(dir, migrations);
    expect(tasks).toHaveLength(2);

    // Run first task — should succeed and bump to version 1
    await tasks[0].task(makeOnProgress());
    expect(getCampaignVersion(dir)).toBe(1);

    // Run second task — should throw and NOT bump the version
    await expect(tasks[1].task(makeOnProgress())).rejects.toThrow('conversion impossible');

    // Version stays at 1 (the last successful migration)
    expect(getCampaignVersion(dir)).toBe(1);
  });

  it('sampleMigration is idempotent: running run() twice does not throw and produces the same version', async () => {
    const dir = makeTmpDir();

    const onProgress = makeOnProgress();

    // Run once
    const result1 = sampleMigration.run(dir, onProgress);
    await result1;
    setCampaignVersion(dir, sampleMigration.targetVersion);
    const versionAfterFirst = getCampaignVersion(dir);

    // Run again — idempotent; appending the same noop log entry is harmless
    const result2 = sampleMigration.run(dir, onProgress);
    await result2;
    setCampaignVersion(dir, sampleMigration.targetVersion);
    const versionAfterSecond = getCampaignVersion(dir);

    expect(versionAfterFirst).toBe(sampleMigration.targetVersion);
    expect(versionAfterSecond).toBe(versionAfterFirst);
  });

  it('sampleMigration returns "no changes" as its summary', async () => {
    const dir = makeTmpDir();
    const onProgress = makeOnProgress();

    const summary = await sampleMigration.run(dir, onProgress);

    expect(summary).toBe('no changes');
  });
});
