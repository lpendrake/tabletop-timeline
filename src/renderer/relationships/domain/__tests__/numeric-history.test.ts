import { describe, expect, it } from 'vitest';
import { startingValue, type Ledger } from '../../../../shared/relationships';
import { formatEntryDate } from '../entry-date';
import { entryTooltip, numericHistoryModel, yearTooltip } from '../numeric-history';
import { plotRange, valueFraction } from '../plot-scale';
import { scaleColourCss, valueColour } from '../scale-colour';
import { defaultViewOrder, rowListKey } from '../view-order';
import { deriveViewRows } from '../view-rows';
import { YEAR, fixtureYearOf, historyEntry } from './history-fixtures';
import { noBands, pf2e } from './numeric-fixtures';

const at = (year: number, offset = 0) => year * YEAR + offset;
const ctx = (track = pf2e) => ({
  track,
  range: plotRange(track, []),
  now: at(4724, 500),
  yearOf: fixtureYearOf,
});

describe('numeric-history', () => {
  it('previousValue chains from the starting value through a set', () => {
    const ledger: Ledger = {
      holder: 'aaaa',
      observer: 'bbbb',
      track: noBands.id,
      deltas: [
        { op: 'adjust', by: 3, at: 10, declaredIn: { path: 'timeline/a.md', ordinal: 0 } },
        { op: 'set', value: -4, at: 20, declaredIn: { path: 'timeline/b.md', ordinal: 0 } },
        { op: 'adjust', by: 2, at: 30, declaredIn: { path: 'timeline/c.md', ordinal: 0 } },
      ],
    };
    const { groups } = deriveViewRows({
      ledgers: [ledger],
      track: noBands,
      trackId: noBands.id,
      holderId: 'aaaa',
      now: 100,
      titleByPath: new Map(),
      labelFor: (id) => id,
      query: '',
      enabledScopes: ['name'],
      sortMode: 'mine',
      viewOrder: {
        ...defaultViewOrder(),
        expanded: { [rowListKey(noBands.id, 'aaaa')]: ['bbbb'] },
      },
    });
    const history = groups[0].rows[0].history!;
    expect(history[0].previousValue).toBe(startingValue(noBands));
    expect(history.map((e) => e.previousValue)).toEqual([0, 3, -4]);
    expect(history.map((e) => e.runningValue)).toEqual([3, -4, -2]);
  });

  it('builds adjust, set and undated entry models', () => {
    const adjust = historyEntry({ at: at(4724, 1), previousValue: 14, runningValue: 18 });
    const decrease = historyEntry({ at: at(4724, 2), previousValue: 18, runningValue: 15 });
    const set = historyEntry(
      { at: at(4724, 3), previousValue: 14, runningValue: 10 },
      { op: 'set', value: 10 },
    );
    const note = historyEntry({ at: null, previousValue: 0, runningValue: 5 });
    const [year, undatedYear] = numericHistoryModel([note, adjust, decrease, set], ctx());
    const [s, d, a] = year.entries;

    expect(a).toMatchObject({
      amount: '+4',
      tone: 'positive',
      future: false,
      reason: 'Because',
      reasonTooltip: 'Night of Ash: Because',
      path: 'timeline/night.md',
      runningText: '18',
      classes: 'rel-num-entry',
      colour: scaleColourCss(valueColour(pf2e, 18)),
      tooltip: '+4 · 14 → 18 · Night of Ash',
    });
    expect(a.dateLabel).toBe(formatEntryDate(adjust.at, { narrow: true }));
    expect(d).toMatchObject({ amount: '−3', tone: 'negative' });
    expect(s).toMatchObject({
      amount: 'set',
      tone: 'neutral',
      classes: 'rel-num-entry is-set',
      tooltip: 'set · 14 → 10 · Night of Ash',
    });
    const range = ctx().range;
    expect(a.dot).toBe(valueFraction(range, 18));
    expect(a.line.left).toBe(valueFraction(range, 14));
    expect(a.line.width).toBeCloseTo(valueFraction(range, 18) - valueFraction(range, 14));

    const [n] = undatedYear.entries;
    expect(n).toMatchObject({
      dateLabel: '',
      reasonTooltip: 'Note: Because',
      path: 'notes/x.md',
      tooltip: '+5 · 0 → 5 · Note',
    });
  });

  it('builds the reason tooltip from the link label and the reason', () => {
    const tooltipOf = (over: Parameters<typeof historyEntry>[0]) =>
      numericHistoryModel([historyEntry(over)], ctx())[0].entries[0].reasonTooltip;
    const dated = { at: at(4724, 1), previousValue: 0, runningValue: 1 };
    expect(tooltipOf({ ...dated, reason: 'Burned the orchard' })).toBe(
      'Night of Ash: Burned the orchard',
    );
    expect(tooltipOf({ ...dated, reason: 'Night of Ash' })).toBe('Night of Ash');
    expect(tooltipOf({ at: null, previousValue: 0, runningValue: 1, reason: 'Unspecified' })).toBe(
      'Note: Unspecified',
    );
  });

  it('flags hit, dim and future entries in the classes', () => {
    const entries = [
      historyEntry({ at: at(4724, 1), previousValue: 0, runningValue: 1, hit: true }),
      historyEntry({ at: at(4724, 2), previousValue: 1, runningValue: 2, hit: false }),
      historyEntry({ at: at(4724, 3), previousValue: 2, runningValue: 3, applied: false }),
    ];
    const [year] = numericHistoryModel(entries, ctx());
    expect(year.entries.map((e) => e.classes)).toEqual([
      'rel-num-entry is-future',
      'rel-num-entry is-dim',
      'rel-num-entry is-hit',
    ]);
    expect(year.entries[0].future).toBe(true);
    expect(year.matchText).toBe('· 1 match');
  });

  it('builds the year summary', () => {
    const [year] = numericHistoryModel(
      [
        historyEntry({ at: at(4724, 1), previousValue: -21, runningValue: -25 }),
        historyEntry({ at: at(4724, 2), previousValue: -25, runningValue: -30 }),
      ],
      ctx(),
    );
    expect(year).toMatchObject({
      label: '4724',
      countText: '2 entries',
      changeText: '−21 → −30 (−9)',
      netTone: 'negative',
      matchText: null,
      colour: scaleColourCss(valueColour(pf2e, -30)),
    });
    expect(year.line.width).toBeCloseTo(9 / 100);
    expect(year.tooltip).toBe(yearTooltip('4724', -21, -30, pf2e));
  });

  it('formats entry tooltips', () => {
    expect(
      entryTooltip(historyEntry({ at: at(4724, 1), previousValue: 14, runningValue: 18 })),
    ).toBe('+4 · 14 → 18 · Night of Ash');
    expect(
      entryTooltip(
        historyEntry(
          { at: at(4724, 1), previousValue: 14, runningValue: 10 },
          { op: 'set', value: 10 },
        ),
      ),
    ).toBe('set · 14 → 10 · Night of Ash');
    expect(
      entryTooltip(
        historyEntry({ at: at(4724, 1), previousValue: 1, runningValue: 2, eventTitle: null }),
      ),
    ).toBe('+1 · 1 → 2 · night.md');
  });

  it('formats year tooltips with and without bands', () => {
    expect(yearTooltip('4724', 3, 12, pf2e)).toBe(
      `4724: Changed by +9. Started at 3 (${pf2e.labelFor(3)}), ended at 12 (${pf2e.labelFor(12)})`,
    );
    expect(yearTooltip('4724', 3, 12, noBands)).toBe(
      '4724: Changed by +9. Started at 3, ended at 12',
    );
    expect(yearTooltip('Undated notes', 5, 5, noBands)).toBe(
      'Undated notes: Changed by 0. Started at 5, ended at 5',
    );
  });
});
