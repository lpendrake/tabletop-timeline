import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { appendMigrationLog } from '../migration-log.js';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tti-migration-log-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe('appendMigrationLog', () => {
  it('creates the migration-log folder and writes one NDJSON line', () => {
    const dir = makeTmpDir();
    const entry = { renameFile: { oldPath: 'events/a.md', newPath: 'events/b.md' } };

    appendMigrationLog(dir, '0002-test', entry);

    const logDir = path.join(dir, 'migration-log');
    expect(fs.existsSync(logDir)).toBe(true);

    const content = fs.readFileSync(path.join(logDir, '0002-test.log.json'), 'utf-8');
    expect(content).toBe(JSON.stringify(entry) + '\n');
    expect(JSON.parse(content.trimEnd())).toEqual(entry);
  });

  it('appends multiple entries as separate lines', () => {
    const dir = makeTmpDir();
    const entry1 = { renameFile: { oldPath: 'events/a.md', newPath: 'events/b.md' } };
    const entry2 = { editFrontmatter: { file: 'events/b.md', key: 'title', value: 'New Title' } };

    appendMigrationLog(dir, '0002-test', entry1);
    appendMigrationLog(dir, '0002-test', entry2);

    const content = fs.readFileSync(path.join(dir, 'migration-log', '0002-test.log.json'), 'utf-8');
    const lines = content.trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual(entry1);
    expect(JSON.parse(lines[1])).toEqual(entry2);
  });

  it('writes to <logName>.log.json named after the migration', () => {
    const dir = makeTmpDir();
    const logName = '0001-sample-migration';

    appendMigrationLog(dir, logName, { noop: { detail: 'sample ran' } });

    const expectedFile = path.join(dir, 'migration-log', `${logName}.log.json`);
    expect(fs.existsSync(expectedFile)).toBe(true);
  });
});
