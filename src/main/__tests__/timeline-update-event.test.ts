import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import matter from 'gray-matter';
import { createEventHandler, updateEventHandler } from '../timelineIpcHandlers.js';
import type { EventFrontmatter } from '../../renderer/timeline/data/types.js';

const tmpDirs: string[] = [];

function campaign(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tti-update-event-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

/** Helper: create an event file directly on disk and return its mtime. */
function seedEvent(
  dir: string,
  filename: string,
  frontmatter: EventFrontmatter,
  body: string,
): string {
  const result = createEventHandler(dir, filename, frontmatter, body);
  if (!result.ok) throw new Error('seedEvent: createEventHandler failed');
  return result.event.lastModified;
}

const BASE_FM: EventFrontmatter = { title: 'Test Event', date: '4707-10-01' };

describe('parseEventFile — title source', () => {
  it('title comes from body H1 via parseEventFile', () => {
    const dir = campaign();
    const body = '# My H1\n\nSome content.';
    const result = createEventHandler(
      dir,
      '4707-10-01-test.md',
      { ...BASE_FM, title: 'Other' },
      body,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.event.event.title).toBe('My H1');
  });

  it('title falls back to frontmatter when no H1', () => {
    const dir = campaign();
    const body = 'No heading here.';
    const result = createEventHandler(
      dir,
      '4707-10-01-test.md',
      { ...BASE_FM, title: 'Fallback' },
      body,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.event.event.title).toBe('Fallback');
  });
});

describe('listEvents — H1 title extraction', () => {
  it('H1 wins over frontmatter title when reading created files', () => {
    const dir = campaign();
    // Event with H1
    const r1 = createEventHandler(
      dir,
      '4707-10-01-h1.md',
      { ...BASE_FM, title: 'FM Title' },
      '# H1 Title\nContent.',
    );
    expect(r1.ok).toBe(true);
    if (!r1.ok) throw new Error('unreachable');
    expect(r1.event.event.title).toBe('H1 Title');

    // Event without H1
    const r2 = createEventHandler(
      dir,
      '4707-10-02-fm.md',
      { ...BASE_FM, title: 'FM Only' },
      'No heading.',
    );
    expect(r2.ok).toBe(true);
    if (!r2.ok) throw new Error('unreachable');
    expect(r2.event.event.title).toBe('FM Only');
  });
});

describe('updateEventHandler', () => {
  it('with no desiredFilename writes same file', () => {
    const dir = campaign();
    const filename = '4707-10-01-test.md';
    const mtime = seedEvent(dir, filename, BASE_FM, 'Original body.');

    const result = updateEventHandler(
      dir,
      filename,
      { ...BASE_FM, title: 'Updated' },
      'Updated body.',
      mtime,
    );

    expect('event' in result).toBe(true);
    if (!('event' in result)) throw new Error('unreachable');
    expect(result.event.filename).toBe(filename);

    const filePath = path.join(dir, 'timeline', filename);
    expect(fs.existsSync(filePath)).toBe(true);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { data } = matter(raw);
    expect(data.title).toBe('Updated');
  });

  it('with same desiredFilename as current does no rename', () => {
    const dir = campaign();
    const filename = '4707-10-01-test.md';
    const mtime = seedEvent(dir, filename, BASE_FM, 'Body.');

    const result = updateEventHandler(dir, filename, BASE_FM, 'Body.', mtime, filename);

    expect('event' in result).toBe(true);
    if (!('event' in result)) throw new Error('unreachable');
    expect(result.event.filename).toBe(filename);

    // Only the one original file should exist
    const timelineDir = path.join(dir, 'timeline');
    const files = fs.readdirSync(timelineDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toBe(filename);
  });

  it('with new free desiredFilename renames file and returns new filename', () => {
    const dir = campaign();
    const oldFilename = '4707-10-01-old.md';
    const newFilename = '4707-10-01-new.md';
    const mtime = seedEvent(dir, oldFilename, BASE_FM, 'Body.');

    const result = updateEventHandler(dir, oldFilename, BASE_FM, 'Body.', mtime, newFilename);

    expect('event' in result).toBe(true);
    if (!('event' in result)) throw new Error('unreachable');
    expect(result.event.filename).toBe(newFilename);

    const timelineDir = path.join(dir, 'timeline');
    expect(fs.existsSync(path.join(timelineDir, oldFilename))).toBe(false);
    expect(fs.existsSync(path.join(timelineDir, newFilename))).toBe(true);
  });

  it('with taken desiredFilename returns conflict filename-taken', () => {
    const dir = campaign();
    const firstFilename = '4707-10-01-first.md';
    const secondFilename = '4707-10-02-second.md';
    const mtime = seedEvent(dir, firstFilename, BASE_FM, 'First.');
    seedEvent(dir, secondFilename, { ...BASE_FM, date: '4707-10-02' }, 'Second.');

    const result = updateEventHandler(dir, firstFilename, BASE_FM, 'First.', mtime, secondFilename);

    expect(result).toEqual({ conflict: true, reason: 'filename-taken', filename: secondFilename });
  });

  it('with stale mtime returns conflict without reason', () => {
    const dir = campaign();
    const filename = '4707-10-01-test.md';
    seedEvent(dir, filename, BASE_FM, 'Body.');

    const result = updateEventHandler(dir, filename, BASE_FM, 'Body.', '1970-01-01T00:00:00.000Z');

    expect(result).toEqual({ conflict: true });
    expect('reason' in result && result.reason).toBeFalsy();
  });

  it('with unsafe desiredFilename throws', () => {
    const dir = campaign();
    const filename = '4707-10-01-test.md';
    const mtime = seedEvent(dir, filename, BASE_FM, 'Body.');

    expect(() => {
      updateEventHandler(dir, filename, BASE_FM, 'Body.', mtime, '../escape.md');
    }).toThrow();
  });
});
