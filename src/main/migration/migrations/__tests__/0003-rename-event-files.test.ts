import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import matter from 'gray-matter';
import { renameEventFilesMigration } from '../0003-rename-event-files.js';
import { MATTER_OPTS } from '../../../matter-opts.js';
import { createCalendar, golarionSpec } from '../../../../shared/calendar/index.js';

const cal = createCalendar(golarionSpec);

const tmpDirs: string[] = [];

function makeCampaignDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tti-0003-test-'));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, 'timeline'), { recursive: true });
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

function noProgress(_: number, __: number) {}

function writeEvent(
  dir: string,
  filename: string,
  frontmatter: Record<string, unknown>,
  body = '',
) {
  const content = matter.stringify(body, frontmatter, MATTER_OPTS);
  fs.writeFileSync(path.join(dir, 'timeline', filename), content, 'utf-8');
}

function listEventFiles(dir: string): string[] {
  return fs.readdirSync(path.join(dir, 'timeline')).filter((f) => f.endsWith('.md'));
}

describe('0003-rename-event-files migration', () => {
  it('renames a date-only event file to YYYY-DDD-slug format', () => {
    const dir = makeCampaignDir();
    // 4726-05-04: day-of-year = Jan(31)+Feb(28)+Mar(31)+Apr(30)+4 = 124
    const epochSeconds = cal.toEpochSeconds(cal.tryParse('4726-05-04')!);
    writeEvent(dir, '4726-05-04-battle-of-absalom.md', {
      title: 'Battle',
      date: '4726-05-04',
      epochSeconds,
    });

    renameEventFilesMigration.run(dir, noProgress);

    const files = listEventFiles(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toBe('4726-124-battle-of-absalom.md');
  });

  it('day-of-year for 4726-05-04 is 124', () => {
    const d = cal.tryParse('4726-05-04')!;
    expect(cal.dayOfYear(d)).toBe(124);
  });

  it('renames an event file with a time component (no colons in filename)', () => {
    const dir = makeCampaignDir();
    const dateStr = '4726-05-04T07:00:00';
    const epochSeconds = cal.toEpochSeconds(cal.tryParse(dateStr)!);
    writeEvent(dir, '4726-05-04T070000-morning-raid.md', {
      title: 'Morning Raid',
      date: dateStr,
      epochSeconds,
    });

    renameEventFilesMigration.run(dir, noProgress);

    const files = listEventFiles(dir);
    expect(files).toHaveLength(1);
    // Time-bearing files: YYYY-DDD-Thhmmss-slug
    expect(files[0]).toBe('4726-124T070000-morning-raid.md');
  });

  it('renames a file with colons in the old time format', () => {
    const dir = makeCampaignDir();
    // Old format might have been YYYY-MM-DDTHH:MM:SS-slug but colons are unsafe
    // so this tests the time=00:00:00 case which uses no-time format
    const dateStr = '4726-01-01T00:00:00';
    const epochSeconds = cal.toEpochSeconds(cal.tryParse(dateStr)!);
    writeEvent(dir, '4726-01-01T000000-new-year.md', {
      title: 'New Year',
      date: dateStr,
      epochSeconds,
    });

    renameEventFilesMigration.run(dir, noProgress);

    const files = listEventFiles(dir);
    expect(files).toHaveLength(1);
    // h=0, m=0, s=0 → no time suffix
    expect(files[0]).toBe('4726-001-new-year.md');
  });

  it('preserves the slug from the old filename', () => {
    const dir = makeCampaignDir();
    const epochSeconds = cal.toEpochSeconds(cal.tryParse('4726-03-15')!);
    writeEvent(dir, '4726-03-15-attack-on-sandpoint.md', {
      title: 'Attack on Sandpoint',
      date: '4726-03-15',
      epochSeconds,
    });

    renameEventFilesMigration.run(dir, noProgress);

    const files = listEventFiles(dir);
    expect(files[0]).toMatch(/attack-on-sandpoint\.md$/);
  });

  it('is idempotent — files already in new scheme are skipped', () => {
    const dir = makeCampaignDir();
    const epochSeconds = cal.toEpochSeconds(cal.tryParse('4726-05-04')!);
    // Write a file already in the new YYYY-DDD scheme
    writeEvent(dir, '4726-124-battle-of-absalom.md', {
      title: 'Battle',
      date: '4726-05-04',
      epochSeconds,
    });

    const result = renameEventFilesMigration.run(dir, noProgress);

    const files = listEventFiles(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toBe('4726-124-battle-of-absalom.md');
    expect(result).toBe('no changes');
  });

  it('running twice on old-scheme files is safe (second run is a no-op)', () => {
    const dir = makeCampaignDir();
    const epochSeconds = cal.toEpochSeconds(cal.tryParse('4726-05-04')!);
    writeEvent(dir, '4726-05-04-battle.md', {
      title: 'Battle',
      date: '4726-05-04',
      epochSeconds,
    });

    renameEventFilesMigration.run(dir, noProgress);
    const after1 = listEventFiles(dir);

    const result2 = renameEventFilesMigration.run(dir, noProgress);
    const after2 = listEventFiles(dir);

    expect(after2).toEqual(after1);
    expect(result2).toBe('no changes');
  });

  it('throws when epochSeconds is missing (migration 0002 not yet run)', () => {
    const dir = makeCampaignDir();
    writeEvent(dir, '4726-05-04-battle.md', {
      title: 'Battle',
      date: '4726-05-04',
    });

    expect(() => renameEventFilesMigration.run(dir, noProgress)).toThrow(
      /has no "epochSeconds" field/,
    );
  });

  it('throws on collision (target filename already exists)', () => {
    const dir = makeCampaignDir();
    const epochSeconds = cal.toEpochSeconds(cal.tryParse('4726-05-04')!);

    // Both files resolve to the same new filename
    writeEvent(dir, '4726-05-04-battle.md', {
      title: 'Battle',
      date: '4726-05-04',
      epochSeconds,
    });
    // Pre-create the target to simulate collision
    writeEvent(dir, '4726-124-battle.md', {
      title: 'Already there',
      date: '4726-05-04',
      epochSeconds,
    });

    expect(() => renameEventFilesMigration.run(dir, noProgress)).toThrow(/collision detected/);
  });

  it('lexical sort of new filenames is chronological', () => {
    const dir = makeCampaignDir();

    const dates = ['4726-01-01', '4726-03-15', '4726-05-04', '4726-12-31'];
    for (const d of dates) {
      const epochSeconds = cal.toEpochSeconds(cal.tryParse(d)!);
      writeEvent(dir, `${d}-event-${d}.md`, {
        title: `Event ${d}`,
        date: d,
        epochSeconds,
      });
    }

    renameEventFilesMigration.run(dir, noProgress);

    const files = listEventFiles(dir).sort();
    // Each file should be in ascending order (lexical = chronological for same year)
    for (let i = 1; i < files.length; i++) {
      expect(files[i] > files[i - 1]).toBe(true);
    }

    // Verify the day-of-year values are ascending
    const doys = files.map((f) => {
      const m = /^\d{4}-(\d{3})-/.exec(f);
      return m ? parseInt(m[1], 10) : -1;
    });
    for (let i = 1; i < doys.length; i++) {
      expect(doys[i]).toBeGreaterThan(doys[i - 1]);
    }
  });

  it('handles multiple files correctly', () => {
    const dir = makeCampaignDir();
    const events = [
      { filename: '4726-02-14-valentines.md', date: '4726-02-14' },
      { filename: '4726-08-22-summer-festival.md', date: '4726-08-22' },
    ];

    for (const { filename, date } of events) {
      const epochSeconds = cal.toEpochSeconds(cal.tryParse(date)!);
      writeEvent(dir, filename, { title: filename, date, epochSeconds });
    }

    const result = renameEventFilesMigration.run(dir, noProgress);
    expect(result).toMatch(/renamed 2 event files/);

    const files = listEventFiles(dir);
    expect(files).toHaveLength(2);

    // Check day-of-year for 4726-02-14: Jan(31)+14 = 45
    const d1 = cal.tryParse('4726-02-14')!;
    expect(cal.dayOfYear(d1)).toBe(45);

    // Check day-of-year for 4726-08-22: Jan(31)+Feb(28)+Mar(31)+Apr(30)+May(31)+Jun(30)+Jul(31)+22 = 234
    const d2 = cal.tryParse('4726-08-22')!;
    expect(cal.dayOfYear(d2)).toBe(234);

    expect(files.some((f) => f.startsWith('4726-045-'))).toBe(true);
    expect(files.some((f) => f.startsWith('4726-234-'))).toBe(true);
  });
});
