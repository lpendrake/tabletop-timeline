import { describe, expect, it } from 'vitest';
import {
  computeValue,
  currentValue,
  type Ledger,
  type RelationshipDelta,
} from '../../../../shared/relationships';
import {
  UNDATED_YEAR_KEY,
  UNDATED_YEAR_LABEL,
  currentYear,
  groupHistoryByYear,
  isYearOpen,
  withToggledYear,
  yearCountLabel,
  yearLabel,
  yearMatchLabel,
} from '../history-years';
import { defaultViewOrder, rowListKey } from '../view-order';
import { deriveViewRows, type HistoryEntry } from '../view-rows';
import { YEAR, fixtureYearOf, historyEntry } from './history-fixtures';
import { noBands } from './numeric-fixtures';

const at = (year: number, offset = 0) => year * YEAR + offset;
const dated = (
  year: number,
  prev: number,
  run: number,
  over: Omit<Partial<HistoryEntry>, 'previousValue' | 'runningValue'> = {},
) => historyEntry({ at: at(year, 1), previousValue: prev, runningValue: run, ...over });
const undated = (prev: number, run: number) =>
  historyEntry({ at: null, previousValue: prev, runningValue: run });
const group = (history: HistoryEntry[], now = at(4724, 500)) =>
  groupHistoryByYear(history, now, fixtureYearOf);

describe('history-years', () => {
  it('groups newest year first, undated last, entries newest first', () => {
    const history = [
      undated(0, 1),
      dated(4723, 1, 2),
      dated(4723, 2, 3),
      dated(4724, 3, 5),
      dated(4725, 5, 6),
    ];
    const years = group(history);
    expect(years.map((y) => y.key)).toEqual(['4725', '4724', '4723', UNDATED_YEAR_KEY]);
    expect(years.map((y) => y.year)).toEqual([4725, 4724, 4723, null]);
    expect(years[2].entries.map((e) => e.runningValue)).toEqual([3, 2]);
    expect(years[2]).toMatchObject({ from: 1, to: 3, count: 2 });
    expect(yearLabel(years[0])).toBe('4725');
    expect(yearLabel(years[3])).toBe(UNDATED_YEAR_LABEL);
  });

  it('marks a year scheduled only when every entry is still ahead', () => {
    const years = group([
      dated(4724, 0, 1),
      dated(4725, 1, 2, { applied: false }),
      dated(4725, 2, 3, { applied: false }),
      dated(4726, 3, 4, { applied: false }),
      dated(4726, 4, 5),
    ]);
    const byKey = Object.fromEntries(years.map((y) => [y.key, y]));
    expect(byKey['4725'].allFuture).toBe(true);
    expect(yearCountLabel(byKey['4725'])).toBe('2 entries · scheduled');
    expect(byKey['4726'].allFuture).toBe(false);
    expect(yearCountLabel(byKey['4726'])).toBe('2 entries');
    expect(yearCountLabel(byKey['4724'])).toBe('1 entry');
  });

  it('opens the current year and later ones by default', () => {
    const history = [
      undated(0, 1),
      dated(4723, 1, 2),
      dated(4724, 2, 3),
      dated(4726, 3, 4, { applied: false }),
    ];
    const open = (now: number) =>
      Object.fromEntries(group(history, now).map((y) => [y.key, y.defaultOpen]));
    expect(open(at(4724, 500))).toEqual({
      '4726': true,
      '4724': true,
      '4723': false,
      [UNDATED_YEAR_KEY]: false,
    });
    expect(open(Infinity)).toEqual({
      '4726': true,
      '4724': false,
      '4723': false,
      [UNDATED_YEAR_KEY]: false,
    });
    expect(currentYear(history, Infinity, fixtureYearOf)).toBe(4726);
    expect(currentYear([undated(0, 1)], at(4724), fixtureYearOf)).toBeNull();
  });

  it('opens the newest year when the as-of year has no entries', () => {
    const history = [dated(4720, 0, 1), dated(4722, 1, 2)];
    const open = Object.fromEntries(
      group(history, at(4725, 500)).map((y) => [y.key, y.defaultOpen]),
    );
    expect(open).toEqual({ '4722': true, '4720': false });
  });

  it('opens undated when it is the only group', () => {
    expect(group([undated(0, 1)])[0].defaultOpen).toBe(true);
  });

  it('lets an explicit toggle win in both directions, and search hits open a year', () => {
    const [y2724, y2723] = group([dated(4723, 0, 1), dated(4724, 1, 2)]).reverse();
    const none = new Map<string, boolean>();
    expect(isYearOpen(y2723, none)).toBe(true);
    expect(isYearOpen(y2723, new Map([[y2723.key, false]]))).toBe(false);
    expect(isYearOpen(y2724, none)).toBe(false);
    expect(isYearOpen(y2724, new Map([[y2724.key, true]]))).toBe(true);

    const hit = { ...y2724, hits: 1 };
    expect(isYearOpen(hit, none)).toBe(true);
    expect(isYearOpen(hit, new Map([[hit.key, false]]))).toBe(false);
  });

  it('toggling twice returns to the original open state', () => {
    const [year] = group([dated(4723, 0, 1)]);
    const none = new Map<string, boolean>();
    const once = withToggledYear(none, year);
    expect(isYearOpen(year, once)).toBe(!isYearOpen(year, none));
    expect(isYearOpen(year, withToggledYear(once, year))).toBe(isYearOpen(year, none));
    expect(none.size).toBe(0);
  });

  it('counts hits and labels matches', () => {
    const [year] = group([
      dated(4724, 0, 1, { hit: true }),
      dated(4724, 1, 2, { hit: false }),
      dated(4724, 2, 3, { hit: true }),
    ]);
    expect(year.hits).toBe(2);
    expect(yearMatchLabel(year)).toBe('· 2 matches');
    expect(yearMatchLabel({ hits: 1 })).toBe('· 1 match');
    expect(yearMatchLabel({ hits: 0 })).toBeNull();
  });

  it('keeps every entry when 45 entries span 5 years', () => {
    const history = Array.from({ length: 45 }, (_, i) => dated(4720 + Math.floor(i / 9), i, i + 1));
    const years = group(history);
    expect(years).toHaveLength(5);
    expect(years.reduce((sum, y) => sum + y.count, 0)).toBe(45);
  });
});

describe('history years agree with the engine', () => {
  const track = noBands;
  const d = (
    partial: Partial<RelationshipDelta> & Pick<RelationshipDelta, 'op'>,
    n: number,
  ): RelationshipDelta =>
    ({
      at: null,
      declaredIn: { path: `timeline/e${n}.md`, ordinal: n },
      ...partial,
    }) as RelationshipDelta;
  const NOW = at(4724, 500);
  const ledger: Ledger = {
    holder: 'aaaa',
    observer: 'bbbb',
    track: track.id,
    deltas: [
      d({ op: 'set', value: 4, at: null, declaredIn: { path: 'notes/n.md', ordinal: 0 } }, 0),
      d({ op: 'adjust', by: 2, at: at(4723, 10) }, 1),
      d({ op: 'set', value: -3, at: at(4723, 20) }, 2),
      d({ op: 'adjust', by: 5, at: at(4724, 30) }, 3),
      d({ op: 'adjust', by: -1, at: at(4724, 40) }, 4),
      d({ op: 'adjust', by: 3, at: at(4725, 50) }, 5),
      d({ op: 'set', value: 9, at: at(4726, 60) }, 6),
      d({ op: 'adjust', by: 2, at: at(4724, 35), mirrored: true }, 7),
    ],
  };

  it('matches currentValue and computeValue at every year boundary', () => {
    const { groups } = deriveViewRows({
      ledgers: [ledger],
      track,
      trackId: track.id,
      holderId: 'aaaa',
      now: NOW,
      titleByPath: new Map(),
      labelFor: (id) => id,
      query: '',
      enabledScopes: ['name'],
      sortMode: 'mine',
      viewOrder: {
        ...defaultViewOrder(),
        expanded: { [rowListKey(track.id, 'aaaa')]: ['bbbb'] },
      },
    });
    const row = groups[0].rows[0];
    const history = row.history!;
    const years = groupHistoryByYear(history, NOW, fixtureYearOf);

    const applied = history.filter((e) => e.applied);
    expect(applied[applied.length - 1].runningValue).toBe(currentValue(ledger, track, NOW).value);
    expect(row.value).toBe(currentValue(ledger, track, NOW).value);
    expect(history.filter((e) => !e.applied).map((e) => e.at)).toEqual([
      at(4725, 50),
      at(4726, 60),
    ]);

    const dates = years.filter((y) => y.year !== null);
    expect(dates.map((y) => y.key)).toEqual(['4726', '4725', '4724', '4723']);
    for (const year of dates) {
      const first = year.entries[year.entries.length - 1];
      const last = year.entries[0];
      expect(year.to).toBe(computeValue(ledger, track, last.at!));
      expect(year.from).toBe(computeValue(ledger, track, first.at! - 1));
    }
    expect(years[years.length - 1].key).toBe(UNDATED_YEAR_KEY);
    expect(years[years.length - 1].to).toBe(4);
  });
});
