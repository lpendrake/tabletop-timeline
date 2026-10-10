import { beforeEach, describe, expect, it } from 'vitest';
import type { RelationshipDelta } from '../../../../shared/relationships';
import { CalendarProvider } from '../../../timeline/calendar/provider';
import { formatEntryDate } from '../entry-date';
import { tagHistory } from '../categorical-history';
import { NOW, labelFor, ledger, mutualPair, tagDelta, tags } from './categorical-fixtures';

beforeEach(() => {
  CalendarProvider._reset();
});

const noTitles = new Map<string, string>();
const at = (n: number, ordinal = 0) => ({ at: n, declaredIn: { path: `events/${n}.md`, ordinal } });

function history(deltas: RelationshipDelta[], titles = noTitles) {
  return tagHistory(ledger('zara', 'guild', deltas), tags, 'member', NOW, titles, labelFor);
}

describe('tagHistory entries', () => {
  it('labels gained and lost, newest first', () => {
    const h = history([
      tagDelta('add', 'member', at(100)),
      tagDelta('remove', 'member', at(200)),
      tagDelta('add', 'member', at(300)),
    ]);
    expect(h.entries.map((e) => [e.at, e.change])).toEqual([
      [300, 'gained'],
      [200, 'lost'],
      [100, 'gained'],
    ]);
    expect(h.entries[0].dateLabel).toBe(formatEntryDate(300, { narrow: false }));
  });

  it('skips no-op adds and removes', () => {
    const h = history([
      tagDelta('remove', 'member', at(50)),
      tagDelta('add', 'member', at(100)),
      tagDelta('add', 'member', at(150)),
      tagDelta('add', 'customer', at(160)),
    ]);
    expect(h.entries.map((e) => e.at)).toEqual([100]);
    expect(h.status).toEqual({ kind: 'held', since: 100, changes: 1 });
  });

  it('counts a direct and mirrored pair on the same date once', () => {
    const direct = tagDelta('add', 'married', at(100));
    const mirrored = tagDelta('add', 'married', { ...at(100, 1), mirrored: true });
    const h = tagHistory(
      ledger('zara', 'anna', [direct, mirrored]),
      tags,
      'married',
      NOW,
      noTitles,
      labelFor,
    );
    expect(h.entries).toHaveLength(1);
    expect(h.status).toEqual({ kind: 'held', since: 100, changes: 1 });
  });

  it('leaves out future deltas', () => {
    const h = history([
      tagDelta('add', 'member', at(100)),
      tagDelta('remove', 'member', at(NOW + 500)),
    ]);
    expect(h.entries.map((e) => e.change)).toEqual(['gained']);
    expect(h.status.kind).toBe('held');
  });

  it("an undated baseline's title is its declaring note's title", () => {
    const declaredIn = { path: 'notes/guild.md', ordinal: 0 };
    const h = history(
      [tagDelta('add', 'member', { declaredIn })],
      new Map([['notes/guild.md', 'The Thieves Guild']]),
    );
    expect(h.entries[0].at).toBeNull();
    expect(h.entries[0].title).toBe('The Thieves Guild');
    expect(h.entries[0].declaredPath).toBe('notes/guild.md');
    expect(history([tagDelta('add', 'member')]).entries[0].title).toBeNull();
  });

  it('a blank reason becomes null', () => {
    const h = history([
      tagDelta('add', 'member', { ...at(100), reason: '   ' }),
      tagDelta('remove', 'member', { ...at(200), reason: ' Betrayed them ' }),
    ]);
    expect(h.entries.map((e) => e.reason)).toEqual(['Betrayed them', null]);
  });

  it('a mirrored entry records the side it came from', () => {
    const [direct, reverse] = mutualPair('zara', 'anna', 'married', at(100));
    const mirrored = tagHistory(reverse, tags, 'married', NOW, noTitles, labelFor);
    expect(mirrored.entries[0].mirroredFrom).toBe('Zara');
    const own = tagHistory(direct, tags, 'married', NOW, noTitles, labelFor);
    expect(own.entries[0].mirroredFrom).toBeNull();
  });
});

describe('tagHistory status', () => {
  it('reads "Held since {date}" with "· N changes" only when N > 1', () => {
    const once = history([tagDelta('add', 'member', at(100))]);
    expect(once.statusText).toBe(`Held since ${formatEntryDate(100)}`);
    const thrice = history([
      tagDelta('add', 'member', at(100)),
      tagDelta('remove', 'member', at(200)),
      tagDelta('add', 'member', at(300)),
    ]);
    expect(thrice.status).toEqual({ kind: 'held', since: 300, changes: 3 });
    expect(thrice.statusText).toBe(`Held since ${formatEntryDate(300)} · 3 changes`);
  });

  it('reads "Held since baseline (undated note)" for an undated gain', () => {
    const h = history([tagDelta('add', 'member')]);
    expect(h.status).toEqual({ kind: 'held', since: null, changes: 1 });
    expect(h.statusText).toBe('Held since baseline (undated note)');
  });

  it('reads "Not currently held" when the latest change is lost, or there are none', () => {
    const lost = history([
      tagDelta('add', 'member', at(100)),
      tagDelta('remove', 'member', at(200)),
    ]);
    expect(lost.status).toEqual({ kind: 'not-held' });
    expect(lost.statusText).toBe('Not currently held');
    expect(history([]).statusText).toBe('Not currently held');
  });
});
