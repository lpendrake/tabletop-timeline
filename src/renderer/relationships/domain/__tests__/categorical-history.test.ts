import { beforeEach, describe, expect, it } from 'vitest';
import type { RelationshipDelta } from '../../../../shared/relationships';
import { CalendarProvider } from '../../../timeline/calendar/provider';
import { formatEntryDate } from '../entry-date';
import { latestReason, tagHistory } from '../categorical-history';
import { NOW, labelFor, ledger, mutualPair, tagDelta, tags } from './categorical-fixtures';

beforeEach(() => {
  CalendarProvider._reset();
});

const noTitles = new Map<string, string>();
const at = (n: number, ordinal = 0) => ({ at: n, declaredIn: { path: `events/${n}.md`, ordinal } });

function history(deltas: RelationshipDelta[], titles = noTitles) {
  return tagHistory(ledger('zara', 'guild', deltas), tags, 'member', NOW, titles, labelFor);
}

describe('tagHistory', () => {
  it('history is newest first, gained/lost, link label = reason or title', () => {
    const titles = new Map([
      ['events/100.md', 'The Heist'],
      ['events/200.md', 'The Betrayal'],
    ]);
    const h = history(
      [
        tagDelta('add', 'member', { ...at(100), reason: 'Sworn in' }),
        tagDelta('remove', 'member', at(200)),
        tagDelta('add', 'member', at(300)),
      ],
      titles,
    );
    expect(h.map((e) => [e.at, e.change, e.linkLabel])).toEqual([
      [300, 'gained', '300.md'],
      [200, 'lost', 'The Betrayal'],
      [100, 'gained', 'Sworn in'],
    ]);
    expect(h[0].dateLabel).toBe(formatEntryDate(300, { narrow: false }));
    expect(h[2].title).toBe('The Heist');
    expect(h[2].declaredPath).toBe('events/100.md');
  });

  it('a blank reason is null and falls back to the title, then the file name', () => {
    const h = history(
      [
        tagDelta('add', 'member', { ...at(100), reason: '   ' }),
        tagDelta('remove', 'member', { ...at(200), reason: ' Betrayed them ' }),
      ],
      new Map([['events/100.md', 'The Heist']]),
    );
    expect(h.map((e) => [e.reason, e.linkLabel])).toEqual([
      ['Betrayed them', 'Betrayed them'],
      [null, 'The Heist'],
    ]);
  });

  it('history skips no-op and duplicate mirrored changes, and leaves out future ones', () => {
    const noOps = history([
      tagDelta('remove', 'member', at(50)),
      tagDelta('add', 'member', at(100)),
      tagDelta('add', 'member', at(150)),
      tagDelta('add', 'customer', at(160)),
      tagDelta('remove', 'member', at(NOW + 500)),
    ]);
    expect(noOps.map((e) => [e.at, e.change])).toEqual([[100, 'gained']]);

    const direct = tagDelta('add', 'married', at(100));
    const mirrored = tagDelta('add', 'married', { ...at(100, 1), mirrored: true });
    const pair = tagHistory(
      ledger('zara', 'anna', [direct, mirrored]),
      tags,
      'married',
      NOW,
      noTitles,
      labelFor,
    );
    expect(pair).toHaveLength(1);
  });

  it('a mirrored entry records the side it came from', () => {
    const [direct, reverse] = mutualPair('zara', 'anna', 'married', at(100));
    const mirrored = tagHistory(reverse, tags, 'married', NOW, noTitles, labelFor);
    expect(mirrored[0].mirroredFrom).toBe('Zara');
    const own = tagHistory(direct, tags, 'married', NOW, noTitles, labelFor);
    expect(own[0].mirroredFrom).toBeNull();
  });
});

describe('latestReason', () => {
  const reasonOf = (deltas: RelationshipDelta[], titles = noTitles) =>
    latestReason(ledger('zara', 'guild', deltas), tags, 'member', NOW, titles, labelFor);

  it("is the latest change's reason, else its event title, else the file name", () => {
    expect(
      reasonOf([
        tagDelta('add', 'member', { ...at(100), reason: 'Old' }),
        tagDelta('remove', 'member', at(200)),
        tagDelta('add', 'member', { ...at(300), reason: 'Rejoined' }),
      ]),
    ).toBe('Rejoined');
    expect(
      reasonOf([tagDelta('add', 'member', at(100))], new Map([['events/100.md', 'The Heist']])),
    ).toBe('The Heist');
    expect(reasonOf([tagDelta('add', 'member', at(100))])).toBe('100.md');
  });
});
