import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  listCustomCalendars,
  saveCustomCalendar,
  deleteCustomCalendar,
} from '../custom-calendars.js';
import type { CalendarSpec } from '../../../shared/calendar/index.js';
import { GOLARION_ID, GREGORIAN_ID } from '../../../shared/calendar/index.js';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tti-custom-calendars-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

function makeSpec(id: string, name = 'Test Calendar'): CalendarSpec {
  return {
    id,
    name,
    kind: 'custom',
    time: { hoursPerDay: 24, minutesPerHour: 60, secondsPerMinute: 60 },
    months: [{ name: 'Month One', abbrev: 'M1', length: 30 }],
    week: {
      days: [{ name: 'Day One', abbrev: 'D1' }],
      epochWeekdayIndex: 0,
    },
    intercalary: [],
    eras: [{ name: 'Age of Testing', suffix: 'AT', startYear: 0 }],
    leap: { ruleId: 'none' },
  };
}

describe('listCustomCalendars', () => {
  it('returns empty array when calendars.json does not exist', () => {
    const dir = makeTmpDir();
    expect(listCustomCalendars(dir)).toEqual([]);
  });

  it('returns empty array when calendars.json is malformed', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, 'calendars.json'), 'not valid json');
    expect(listCustomCalendars(dir)).toEqual([]);
  });

  it('returns empty array when calendars.json contains a non-array', () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, 'calendars.json'), JSON.stringify({ foo: 'bar' }));
    expect(listCustomCalendars(dir)).toEqual([]);
  });
});

describe('saveCustomCalendar', () => {
  it('appends a new calendar when the id does not exist', () => {
    const dir = makeTmpDir();
    const spec = makeSpec('cust');
    saveCustomCalendar(dir, spec);
    const list = listCustomCalendars(dir);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('cust');
  });

  it('replaces an existing calendar when the id matches (upsert)', () => {
    const dir = makeTmpDir();
    saveCustomCalendar(dir, makeSpec('cust', 'Original'));
    saveCustomCalendar(dir, makeSpec('cust', 'Updated'));
    const list = listCustomCalendars(dir);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Updated');
  });

  it('appends a second calendar with a different id', () => {
    const dir = makeTmpDir();
    saveCustomCalendar(dir, makeSpec('aaa1'));
    saveCustomCalendar(dir, makeSpec('bbb2'));
    const list = listCustomCalendars(dir);
    expect(list).toHaveLength(2);
    expect(list.map((c) => c.id)).toEqual(['aaa1', 'bbb2']);
  });

  it('throws when the id collides with the Golarion system id', () => {
    const dir = makeTmpDir();
    const spec = makeSpec(GOLARION_ID);
    expect(() => saveCustomCalendar(dir, spec)).toThrow();
  });

  it('throws when the id collides with the Gregorian system id', () => {
    const dir = makeTmpDir();
    const spec = makeSpec(GREGORIAN_ID);
    expect(() => saveCustomCalendar(dir, spec)).toThrow();
  });

  it('writes pretty-printed JSON to calendars.json', () => {
    const dir = makeTmpDir();
    saveCustomCalendar(dir, makeSpec('fmt1'));
    const raw = fs.readFileSync(path.join(dir, 'calendars.json'), 'utf-8');
    expect(raw).toContain('\n  ');
  });
});

describe('deleteCustomCalendar', () => {
  it('removes a calendar by id', () => {
    const dir = makeTmpDir();
    saveCustomCalendar(dir, makeSpec('aaa1'));
    saveCustomCalendar(dir, makeSpec('bbb2'));
    deleteCustomCalendar(dir, 'aaa1');
    const list = listCustomCalendars(dir);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('bbb2');
  });

  it('does not throw when deleting a non-existent id from an empty list', () => {
    const dir = makeTmpDir();
    expect(() => deleteCustomCalendar(dir, 'xxxx')).not.toThrow();
  });

  it('does not throw when deleting a non-existent id from a populated list', () => {
    const dir = makeTmpDir();
    saveCustomCalendar(dir, makeSpec('aaa1'));
    expect(() => deleteCustomCalendar(dir, 'xxxx')).not.toThrow();
    expect(listCustomCalendars(dir)).toHaveLength(1);
  });

  it('throws when attempting to delete a system calendar id (Golarion)', () => {
    const dir = makeTmpDir();
    expect(() => deleteCustomCalendar(dir, GOLARION_ID)).toThrow();
  });

  it('throws when attempting to delete a system calendar id (Gregorian)', () => {
    const dir = makeTmpDir();
    expect(() => deleteCustomCalendar(dir, GREGORIAN_ID)).toThrow();
  });
});
