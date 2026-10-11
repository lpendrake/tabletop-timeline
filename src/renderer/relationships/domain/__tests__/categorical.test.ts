import { beforeEach, describe, expect, it } from 'vitest';
import type { Ledger } from '../../../../shared/relationships';
import { CalendarProvider } from '../../../timeline/calendar/provider';
import {
  deriveCategoricalTable,
  parseGroupBy,
  toggledId,
  type CategoricalGroupBy,
  type CategoricalTable,
} from '../categorical';
import type { SearchScope } from '../search';
import {
  NOW,
  entriesFor,
  holds,
  labelFor,
  ledger,
  mutualPair,
  tagDelta,
  tags,
} from './categorical-fixtures';

beforeEach(() => {
  CalendarProvider._reset();
});

const ALL: SearchScope[] = ['holder', 'tag', 'observer'];

interface Setup {
  groupBy?: CategoricalGroupBy;
  query?: string;
  enabledScopes?: SearchScope[];
  titles?: Map<string, string>;
}

function table(ledgers: Ledger[], setup: Setup = {}): CategoricalTable {
  return deriveCategoricalTable(entriesFor(ledgers, setup.titles), {
    track: tags,
    groupBy: setup.groupBy ?? 'holder',
    query: setup.query ?? '',
    enabledScopes: setup.enabledScopes ?? ALL,
    labelFor,
  });
}

/** Member: Zara and Anna at the guild, Mira at the inn; Dax is a customer; Zara and Anna are married. */
function sample(): Ledger[] {
  return [
    holds('zara', 'guild', 'member'),
    holds('anna', 'guild', 'member'),
    holds('mira', 'inn', 'member'),
    holds('dax', 'inn', 'customer'),
    ...mutualPair('zara', 'anna', 'married'),
  ];
}

/** Each row as holder · tag · observer, the order the table's columns read. */
const allSentences = (t: CategoricalTable) =>
  t.sections.flatMap((s) =>
    s.rows.map((r) => `${r.holderLabel} · ${r.chip.label} · ${r.observerLabel}`),
  );

describe('categorical table rows', () => {
  it('only tags held at now become rows', () => {
    const t = table([
      holds('mira', 'inn', 'member'),
      ledger('zara', 'guild', [
        tagDelta('add', 'member', { at: 100, declaredIn: { path: 'events/100.md', ordinal: 0 } }),
        tagDelta('remove', 'member', {
          at: 200,
          declaredIn: { path: 'events/200.md', ordinal: 0 },
        }),
      ]),
      holds('anna', 'guild', 'member', {
        at: NOW + 5,
        declaredIn: { path: 'events/future.md', ordinal: 0 },
      }),
    ]);
    expect(allSentences(t)).toEqual(['Mira · member · Rusty Inn']);
    expect(t.total).toBe(1);
  });

  it('every row reads holder · tag · observer in both groupings', () => {
    const ledgers = [holds('zara', 'guild', 'member'), holds('dax', 'inn', 'customer')];
    const byHolder = allSentences(table(ledgers, { groupBy: 'holder' }));
    const byTag = allSentences(table(ledgers, { groupBy: 'tag' }));
    expect(byHolder).toEqual(['Dax · customer · Rusty Inn', 'Zara · member · Thieves Guild']);
    expect([...byTag].sort()).toEqual(byHolder);
  });

  it('by holder: one section per holder, A–Z, with rows A–Z by tag then observer', () => {
    const t = table(sample());
    expect(t.groupBy).toBe('holder');
    expect(t.sections.map((s) => [s.kind, s.title, s.rows.length, s.chip])).toEqual([
      ['holder', 'Anna', 2, null],
      ['holder', 'Dax', 1, null],
      ['holder', 'Mira', 1, null],
      ['holder', 'Zara', 2, null],
    ]);
    expect(t.sections[0].rows.map((r) => [r.chip.label, r.observerLabel])).toEqual([
      ['married', 'Zara'],
      ['member', 'Thieves Guild'],
    ]);
    const twoObservers = table([holds('zara', 'inn', 'member'), holds('zara', 'guild', 'member')]);
    expect(twoObservers.sections[0].rows.map((r) => r.observerLabel)).toEqual([
      'Rusty Inn',
      'Thieves Guild',
    ]);
  });

  it('by tag: one section per held option in spec order, flagged mutual', () => {
    const t = table(sample(), { groupBy: 'tag' });
    expect(t.sections.map((s) => [s.id, s.title, s.mutual, s.rows.length, s.chip?.label])).toEqual([
      ['member', 'member', false, 3, 'member'],
      ['customer', 'customer', false, 1, 'customer'],
      ['married', 'married', true, 1, 'married'],
    ]);
    expect(t.sections[0].rows.map((r) => r.holderLabel)).toEqual(['Anna', 'Mira', 'Zara']);
  });

  it('by tag: a mutual pair appears once', () => {
    const married = table(sample(), { groupBy: 'tag' }).sections.find((s) => s.id === 'married')!;
    expect(married.rows.map((r) => [r.holderLabel, r.observerLabel, r.mutual])).toEqual([
      ['Anna', 'Zara', true],
    ]);
  });

  it('by holder: a mutual pair appears under both holders, each as that holder ⇄ the other', () => {
    const t = table(sample());
    const marriedRows = t.sections.flatMap((s) => s.rows.filter((r) => r.option === 'married'));
    expect(marriedRows.map((r) => [r.holderLabel, r.observerLabel, r.mutual])).toEqual([
      ['Anna', 'Zara', true],
      ['Zara', 'Anna', true],
    ]);
  });

  it('total and matched count a mutual pair once in both groupings', () => {
    for (const groupBy of ['holder', 'tag'] as const) {
      const all = table(sample(), { groupBy });
      expect([all.total, all.matched]).toEqual([5, 5]);
      const some = table(sample(), { groupBy, query: 'anna' });
      expect([some.total, some.matched]).toEqual([5, 2]);
    }
  });
});

describe('categorical table search', () => {
  it('Holder scope matches holders', () => {
    const t = table(sample(), { query: 'dax', enabledScopes: ['holder'] });
    expect(allSentences(t)).toEqual(['Dax · customer · Rusty Inn']);
    expect(table(sample(), { query: 'inn', enabledScopes: ['holder'] }).matched).toBe(0);
  });

  it('a scoped search shows a mutual pair in the matched direction under both groupings', () => {
    const married = (setup: Setup) =>
      allSentences(table(mutualPair('zara', 'anna', 'married'), { ...setup, query: 'zara' }));
    const only = (scope: SearchScope) => ({ enabledScopes: [scope] });
    expect(married({ ...only('holder'), groupBy: 'holder' })).toEqual(['Zara · married · Anna']);
    expect(married({ ...only('holder'), groupBy: 'tag' })).toEqual(['Zara · married · Anna']);
    expect(married({ ...only('observer'), groupBy: 'holder' })).toEqual(['Anna · married · Zara']);
    expect(married({ ...only('observer'), groupBy: 'tag' })).toEqual(['Anna · married · Zara']);
  });

  it('Tag scope matches option labels', () => {
    const t = table(sample(), { query: 'cust', enabledScopes: ['tag'] });
    expect(allSentences(t)).toEqual(['Dax · customer · Rusty Inn']);
    expect(table(sample(), { query: 'dax', enabledScopes: ['tag'] }).matched).toBe(0);
  });

  it('Observer scope matches observers', () => {
    const t = table(sample(), { query: 'inn', enabledScopes: ['observer'] });
    expect(allSentences(t)).toEqual(['Dax · customer · Rusty Inn', 'Mira · member · Rusty Inn']);
    expect(table(sample(), { query: 'mira', enabledScopes: ['observer'] }).matched).toBe(0);
  });

  it('words combine with AND across enabled scopes; a disabled scope never matches', () => {
    expect(allSentences(table(sample(), { query: 'anna guild' }))).toEqual([
      'Anna · member · Thieves Guild',
    ]);
    expect(table(sample(), { query: 'anna guild', enabledScopes: ['holder'] }).matched).toBe(0);
    expect(table(sample(), { query: 'guild', enabledScopes: ['holder', 'tag'] }).matched).toBe(0);
    expect(table(sample(), { query: 'anna member' }).matched).toBe(1);
  });

  it('sections with no matching rows are hidden', () => {
    const byTag = table(sample(), { groupBy: 'tag', query: 'customer' });
    expect(byTag.sections.map((s) => s.id)).toEqual(['customer']);
    const byHolder = table(sample(), { query: 'customer' });
    expect(byHolder.sections.map((s) => s.title)).toEqual(['Dax']);
    expect(table(sample(), { query: 'nothing here' }).sections).toEqual([]);
  });
});

describe('categorical table reason', () => {
  it('the reason column falls back to the latest change’s event title', () => {
    const dated = (reason?: string) =>
      holds('zara', 'guild', 'member', {
        at: 100,
        declaredIn: { path: 'events/100.md', ordinal: 0 },
        reason,
      });
    const titles = new Map([['events/100.md', 'The Heist']]);
    expect(table([dated('Sworn in')], { titles }).sections[0].rows[0].reason).toBe('Sworn in');
    expect(table([dated(' ')], { titles }).sections[0].rows[0].reason).toBe('The Heist');
    expect(table([dated()]).sections[0].rows[0].reason).toBe('100.md');
  });

  it('the reason column falls back to the declaring note’s title for an undated baseline', () => {
    const baseline = holds('zara', 'guild', 'member', {
      declaredIn: { path: 'notes/guild.md', ordinal: 0 },
    });
    const titles = new Map([['notes/guild.md', 'The Thieves Guild']]);
    expect(table([baseline], { titles }).sections[0].rows[0].reason).toBe('The Thieves Guild');
    expect(table([baseline]).sections[0].rows[0].reason).toBe('guild.md');
  });
});

describe('parseGroupBy', () => {
  it('parseGroupBy defaults to holder and rejects the old entity value', () => {
    expect(parseGroupBy('holder')).toBe('holder');
    expect(parseGroupBy('tag')).toBe('tag');
    expect(parseGroupBy('entity')).toBe('holder');
    expect(parseGroupBy(null)).toBe('holder');
    expect(parseGroupBy(undefined)).toBe('holder');
  });
});

describe('toggledId', () => {
  it('adds a missing id and removes a present one without mutating', () => {
    const ids = new Set(['a']);
    expect([...toggledId(ids, 'b')]).toEqual(['a', 'b']);
    expect([...toggledId(ids, 'a')]).toEqual([]);
    expect([...ids]).toEqual(['a']);
  });
});
