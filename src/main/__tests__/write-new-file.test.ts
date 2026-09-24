import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { writeNewFile } from '../write-new-file.js';

const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tti-write-new-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe('writeNewFile', () => {
  it('creates a file and its parent folders', () => {
    const dir = tmpDir();
    const fullPath = path.join(dir, 'nested', 'deeper', 'note.md');

    const result = writeNewFile(fullPath, '# Hello');

    expect(result).toEqual({ ok: true });
    expect(fs.existsSync(fullPath)).toBe(true);
    expect(fs.readFileSync(fullPath, 'utf-8')).toBe('# Hello');
  });

  it('refuses an existing file and leaves it byte-for-byte unchanged', () => {
    const dir = tmpDir();
    const fullPath = path.join(dir, 'note.md');
    fs.writeFileSync(fullPath, 'original content');

    const result = writeNewFile(fullPath, 'attempted overwrite');

    expect(result).toEqual({ ok: false, reason: 'exists' });
    expect(fs.readFileSync(fullPath, 'utf-8')).toBe('original content');
  });

  it("reports other errors as 'error'", () => {
    const dir = tmpDir();
    // Make the parent "directory" a regular file, so mkdirSync fails with ENOTDIR.
    const blockerFile = path.join(dir, 'blocker');
    fs.writeFileSync(blockerFile, 'not a directory');
    const fullPath = path.join(blockerFile, 'note.md');

    const result = writeNewFile(fullPath, 'content');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('error');
  });
});
