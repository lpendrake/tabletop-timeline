import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readJsonObject, writeJsonObject } from '../settings-json.js';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tti-settings-json-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe('readJsonObject', () => {
  it('returns {} when file does not exist', () => {
    const dir = makeTmpDir();
    const result = readJsonObject(path.join(dir, 'nonexistent.json'));
    expect(result).toEqual({});
  });

  it('returns {} when file is malformed JSON', () => {
    const dir = makeTmpDir();
    const file = path.join(dir, 'settings.json');
    fs.writeFileSync(file, 'not valid json {{{', 'utf-8');
    expect(readJsonObject(file)).toEqual({});
  });

  it('returns {} when JSON is an array', () => {
    const dir = makeTmpDir();
    const file = path.join(dir, 'settings.json');
    fs.writeFileSync(file, JSON.stringify([1, 2, 3]), 'utf-8');
    expect(readJsonObject(file)).toEqual({});
  });

  it('returns {} when JSON is null', () => {
    const dir = makeTmpDir();
    const file = path.join(dir, 'settings.json');
    fs.writeFileSync(file, 'null', 'utf-8');
    expect(readJsonObject(file)).toEqual({});
  });

  it('roundtrips an object via writeJsonObject then readJsonObject', () => {
    const dir = makeTmpDir();
    const file = path.join(dir, 'settings.json');
    const obj = { theme: 'dark-pathfinder', count: 42, nested: { a: true } };
    writeJsonObject(file, obj);
    expect(readJsonObject(file)).toEqual(obj);
  });

  it('writeJsonObject pretty-prints with 2-space indent', () => {
    const dir = makeTmpDir();
    const file = path.join(dir, 'settings.json');
    writeJsonObject(file, { key: 'value' });
    const text = fs.readFileSync(file, 'utf-8');
    expect(text).toContain('\n');
    expect(text).toContain('  ');
    expect(JSON.parse(text)).toEqual({ key: 'value' });
  });
});
