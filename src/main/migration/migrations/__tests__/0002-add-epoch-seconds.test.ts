import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import matter from 'gray-matter';
import { addEpochSecondsMigration } from '../0002-add-epoch-seconds.js';
import { MATTER_OPTS } from '../../../matter-opts.js';
import { createCalendar, golarionSpec } from '../../../../shared/calendar/index.js';

const cal = createCalendar(golarionSpec);

const tmpDirs: string[] = [];

function makeCampaignDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tti-0002-test-'));
  tmpDirs.push(dir);
  // Create required subdirectories
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

function readEventFrontmatter(dir: string, filename: string): Record<string, unknown> {
  const raw = fs.readFileSync(path.join(dir, 'timeline', filename), 'utf-8');
  return matter(raw, MATTER_OPTS).data;
}

describe('0002-add-epoch-seconds migration', () => {
  it('adds epochSeconds to a date-only event file', () => {
    const dir = makeCampaignDir();
    const dateStr = '4726-05-04';
    writeEvent(dir, '4726-05-04-battle-of-absalom.md', {
      title: 'Battle of Absalom',
      date: dateStr,
    });

    addEpochSecondsMigration.run(dir, noProgress);

    const fm = readEventFrontmatter(dir, '4726-05-04-battle-of-absalom.md');
    expect(fm.epochSeconds).toBeDefined();

    const expected = cal.toEpochSeconds(cal.tryParse(dateStr)!);
    expect(fm.epochSeconds).toBe(expected);
  });

  it('adds epochSeconds to an event file with a datetime', () => {
    const dir = makeCampaignDir();
    const dateStr = '4726-05-04T07:00:00';
    writeEvent(dir, '4726-05-04-morning-raid.md', { title: 'Morning Raid', date: dateStr });

    addEpochSecondsMigration.run(dir, noProgress);

    const fm = readEventFrontmatter(dir, '4726-05-04-morning-raid.md');
    const expected = cal.toEpochSeconds(cal.tryParse(dateStr)!);
    expect(fm.epochSeconds).toBe(expected);
  });

  it('adds epochSeconds to state.json', () => {
    const dir = makeCampaignDir();
    const state = {
      in_game_now: '4726-06-15',
      campaign_start: '4726-01-01',
    };
    fs.writeFileSync(path.join(dir, 'timeline', 'state.json'), JSON.stringify(state), 'utf-8');

    addEpochSecondsMigration.run(dir, noProgress);

    const updated = JSON.parse(fs.readFileSync(path.join(dir, 'timeline', 'state.json'), 'utf-8'));
    expect(updated.in_game_now_seconds).toBe(cal.toEpochSeconds(cal.tryParse('4726-06-15')!));
    expect(updated.campaign_start_seconds).toBe(cal.toEpochSeconds(cal.tryParse('4726-01-01')!));
    // Original fields preserved
    expect(updated.in_game_now).toBe('4726-06-15');
    expect(updated.campaign_start).toBe('4726-01-01');
  });

  it('adds epochSeconds to sessions.json (does not touch realStart/realEnd)', () => {
    const dir = makeCampaignDir();
    const sessions = [
      {
        id: 'sess-1',
        inGameStart: '4726-05-04',
        inGameEnd: '4726-05-05',
        realStart: '2024-01-01T18:00:00Z',
        realEnd: '2024-01-01T22:00:00Z',
        color: '#ff0000',
      },
      {
        id: 'sess-2',
        inGameStart: '4726-06-01T08:00:00',
        inGameEnd: '4726-06-01T20:00:00',
        realStart: '2024-01-08T18:00:00Z',
        realEnd: '2024-01-08T22:00:00Z',
        color: '#00ff00',
      },
    ];
    fs.writeFileSync(path.join(dir, 'sessions.json'), JSON.stringify(sessions), 'utf-8');

    addEpochSecondsMigration.run(dir, noProgress);

    const updated = JSON.parse(fs.readFileSync(path.join(dir, 'sessions.json'), 'utf-8'));

    expect(updated[0].inGameStartSeconds).toBe(cal.toEpochSeconds(cal.tryParse('4726-05-04')!));
    expect(updated[0].inGameEndSeconds).toBe(cal.toEpochSeconds(cal.tryParse('4726-05-05')!));
    // realStart/realEnd must not be touched
    expect(updated[0].realStart).toBe('2024-01-01T18:00:00Z');
    expect(updated[0].realEnd).toBe('2024-01-01T22:00:00Z');

    expect(updated[1].inGameStartSeconds).toBe(
      cal.toEpochSeconds(cal.tryParse('4726-06-01T08:00:00')!),
    );
    expect(updated[1].inGameEndSeconds).toBe(
      cal.toEpochSeconds(cal.tryParse('4726-06-01T20:00:00')!),
    );
  });

  it('is idempotent — running twice produces the same result', () => {
    const dir = makeCampaignDir();
    const dateStr = '4726-05-04';
    writeEvent(dir, '4726-05-04-battle.md', { title: 'Battle', date: dateStr });
    const state = { in_game_now: '4726-06-15', campaign_start: '4726-01-01' };
    fs.writeFileSync(path.join(dir, 'timeline', 'state.json'), JSON.stringify(state), 'utf-8');
    const sessions = [
      {
        id: 's1',
        inGameStart: '4726-05-04',
        inGameEnd: '4726-05-05',
        realStart: '2024-01-01',
        realEnd: '2024-01-01',
        color: '#fff',
      },
    ];
    fs.writeFileSync(path.join(dir, 'sessions.json'), JSON.stringify(sessions), 'utf-8');

    addEpochSecondsMigration.run(dir, noProgress);
    const fm1 = readEventFrontmatter(dir, '4726-05-04-battle.md');
    const state1 = JSON.parse(fs.readFileSync(path.join(dir, 'timeline', 'state.json'), 'utf-8'));
    const sess1 = JSON.parse(fs.readFileSync(path.join(dir, 'sessions.json'), 'utf-8'));

    addEpochSecondsMigration.run(dir, noProgress);
    const fm2 = readEventFrontmatter(dir, '4726-05-04-battle.md');
    const state2 = JSON.parse(fs.readFileSync(path.join(dir, 'timeline', 'state.json'), 'utf-8'));
    const sess2 = JSON.parse(fs.readFileSync(path.join(dir, 'sessions.json'), 'utf-8'));

    expect(fm2.epochSeconds).toBe(fm1.epochSeconds);
    expect(state2.in_game_now_seconds).toBe(state1.in_game_now_seconds);
    expect(state2.campaign_start_seconds).toBe(state1.campaign_start_seconds);
    expect(sess2[0].inGameStartSeconds).toBe(sess1[0].inGameStartSeconds);
    expect(sess2[0].inGameEndSeconds).toBe(sess1[0].inGameEndSeconds);
  });

  it('returns "no changes" when all files already have epochSeconds', () => {
    const dir = makeCampaignDir();
    const expected = cal.toEpochSeconds(cal.tryParse('4726-05-04')!);
    writeEvent(dir, '4726-05-04-battle.md', {
      title: 'Battle',
      date: '4726-05-04',
      epochSeconds: expected,
    });

    const result = addEpochSecondsMigration.run(dir, noProgress);
    expect(result).toBe('no changes');
  });

  it('throws on a malformed date string', () => {
    const dir = makeCampaignDir();
    writeEvent(dir, '4726-05-04-bad-event.md', { title: 'Bad', date: 'not-a-date' });

    expect(() => addEpochSecondsMigration.run(dir, noProgress)).toThrow(
      /cannot parse date "not-a-date"/,
    );
  });

  it('throws when an event file has no date field', () => {
    const dir = makeCampaignDir();
    writeEvent(dir, '4726-05-04-no-date.md', { title: 'No Date' });

    expect(() => addEpochSecondsMigration.run(dir, noProgress)).toThrow(/has no "date" field/);
  });

  it('calls onProgress correctly (completed always <= total, last call hits total)', () => {
    const dir = makeCampaignDir();
    writeEvent(dir, '4726-05-04-evt-a.md', { title: 'A', date: '4726-05-04' });
    writeEvent(dir, '4726-06-01-evt-b.md', { title: 'B', date: '4726-06-01' });
    const state = { in_game_now: '4726-06-15', campaign_start: '4726-01-01' };
    fs.writeFileSync(path.join(dir, 'timeline', 'state.json'), JSON.stringify(state), 'utf-8');
    const sessions = [
      {
        id: 's1',
        inGameStart: '4726-05-04',
        inGameEnd: '4726-05-05',
        realStart: '2024-01-01',
        realEnd: '2024-01-01',
        color: '#fff',
      },
    ];
    fs.writeFileSync(path.join(dir, 'sessions.json'), JSON.stringify(sessions), 'utf-8');

    const calls: [number, number][] = [];
    addEpochSecondsMigration.run(dir, (completed, total) => {
      calls.push([completed, total]);
    });

    // total = 2 events + 1 state + 1 session = 4
    expect(calls.every(([c, t]) => c <= t)).toBe(true);
    expect(calls[calls.length - 1]).toEqual([4, 4]);
  });
});
