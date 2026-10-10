import { describe, expect, it } from 'vitest';
import {
  MUTUAL_LIMIT,
  NAME_LIMIT,
  deriveCategoricalView,
  parseGroupBy,
  visibleNames,
  type CategoricalGroupBy,
  type CategoricalView,
} from '../categorical';
import { entityCardsKey, type ViewOrder } from '../view-order';
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
  viewOrder,
} from './categorical-fixtures';

const ALL: SearchScope[] = ['name', 'group', 'tag'];

function view(
  ledgers: ReturnType<typeof ledger>[],
  over: {
    groupBy?: CategoricalGroupBy;
    query?: string;
    enabledScopes?: SearchScope[];
    viewOrder?: ViewOrder;
  } = {},
): CategoricalView {
  return deriveCategoricalView(entriesFor(ledgers), {
    track: tags,
    trackId: tags.id,
    groupBy: over.groupBy ?? 'tag',
    query: over.query ?? '',
    enabledScopes: over.enabledScopes ?? ALL,
    viewOrder: over.viewOrder ?? viewOrder(),
    labelFor,
  });
}

const sample = () => [
  holds('zara', 'guild', 'member'),
  holds('anna', 'guild', 'member'),
  holds('mira', 'inn', 'member'),
  holds('dax', 'inn', 'customer'),
  ...mutualPair('zara', 'anna', 'married'),
];

describe('buildCategoricalEntries', () => {
  it('only options held at now become entries', () => {
    const entries = entriesFor([
      holds('zara', 'guild', 'member', { at: NOW + 1 }),
      ledger('anna', 'guild', [
        tagDelta('add', 'member', { declaredIn: { path: 'a.md', ordinal: 0 } }),
        tagDelta('remove', 'member', { declaredIn: { path: 'a.md', ordinal: 1 } }),
      ]),
      holds('mira', 'inn', 'customer'),
    ]);
    expect(entries.map((e) => [e.holderId, e.option])).toEqual([['mira', 'customer']]);
  });
});

describe('parseGroupBy', () => {
  it('defaults to tag', () => {
    expect(parseGroupBy('entity')).toBe('entity');
    expect(parseGroupBy('tag')).toBe('tag');
    expect(parseGroupBy(undefined)).toBe('tag');
    expect(parseGroupBy('nonsense')).toBe('tag');
  });
});

describe('deriveCategoricalView grouping', () => {
  it('by tag: one card per held option, in spec order', () => {
    const v = view([
      ...mutualPair('zara', 'anna', 'married'),
      holds('dax', 'inn', 'customer'),
      holds('mira', 'inn', 'member'),
    ]);
    expect(v.cards.map((c) => c.id)).toEqual(['member', 'customer', 'married']);
    expect(v.cards.map((c) => c.id)).not.toContain('hates');
  });

  it('by tag: non-mutual card has a row per observer, A–Z, holders A–Z', () => {
    const member = view(sample()).cards[0];
    expect(member.count).toBe(3);
    expect(member.rows.map((r) => r.label)).toEqual(['Rusty Inn', 'Thieves Guild']);
    expect(member.rows.map((r) => r.names.map((n) => n.label))).toEqual([
      ['Mira'],
      ['Anna', 'Zara'],
    ]);
    expect(member.rows.map((r) => r.count)).toEqual([1, 2]);
    expect(member.pairs).toBeNull();
  });

  it('a mutual pair appears once', () => {
    const married = view(sample()).cards.find((c) => c.id === 'married');
    expect(married?.mutual).toBe(true);
    expect(married?.rows).toEqual([]);
    expect(married?.count).toBe(1);
    expect(married?.pairs).toHaveLength(1);
    expect(married?.pairs?.[0].a.label).toBe('Anna');
    expect(married?.pairs?.[0].b.label).toBe('Zara');
  });

  it('by entity: cards follow the saved entity-cards order, unlisted cards appended A–Z', () => {
    const order = viewOrder();
    order.order[entityCardsKey(tags.id)] = ['inn', 'gone', 'zara'];
    const v = view(sample(), { groupBy: 'entity', viewOrder: order });
    expect(v.cards.map((c) => c.id)).toEqual(['inn', 'zara', 'anna', 'guild']);
    expect(order.order[entityCardsKey(tags.id)]).toEqual(['inn', 'gone', 'zara']);
  });

  it('by entity: rows follow spec option order and flag mutual rows', () => {
    const ledgers = [
      holds('dax', 'zara', 'customer'),
      holds('mira', 'zara', 'member'),
      ...mutualPair('anna', 'zara', 'married'),
    ];
    const zara = view(ledgers, { groupBy: 'entity' }).cards.find((c) => c.id === 'zara');
    expect(zara?.rows.map((r) => r.id)).toEqual(['member', 'customer', 'married']);
    expect(zara?.rows.map((r) => r.mutual)).toEqual([false, false, true]);
    expect(zara?.rows[2].chip?.label).toBe('married');
    expect(zara?.rows[2].names.map((n) => n.label)).toEqual(['Anna']);
    expect(zara?.pairs).toBeNull();
  });
});

describe('deriveCategoricalView search', () => {
  it('Name scope matches holders, including either side of a pair', () => {
    const byName = view(sample(), { query: 'mira' });
    expect(byName.cards.map((c) => c.id)).toEqual(['member']);
    const zaraSide = view(sample(), { query: 'zara', enabledScopes: ['name'] });
    expect(zaraSide.cards.find((c) => c.id === 'married')?.pairs).toHaveLength(1);
    const annaSide = view(sample(), { query: 'anna', enabledScopes: ['name'] });
    expect(annaSide.cards.find((c) => c.id === 'married')?.pairs).toHaveLength(1);
  });

  it('Group scope matches observers', () => {
    const v = view(sample(), { query: 'inn', enabledScopes: ['group'] });
    expect(v.cards.map((c) => c.id)).toEqual(['member', 'customer']);
    expect(v.cards[0].rows.map((r) => r.label)).toEqual(['Rusty Inn']);
  });

  it('Tag scope matches option labels', () => {
    const v = view(sample(), { query: 'custom', enabledScopes: ['tag'] });
    expect(v.cards.map((c) => c.id)).toEqual(['customer']);
  });

  it('words combine with AND across enabled scopes', () => {
    const v = view(sample(), { query: 'mira member' });
    expect(v.matched).toBe(1);
    expect(v.cards.map((c) => c.id)).toEqual(['member']);
    expect(view(sample(), { query: 'mira customer' }).matched).toBe(0);
  });

  it('a disabled scope never matches', () => {
    expect(view(sample(), { query: 'inn', enabledScopes: ['name', 'tag'] }).matched).toBe(0);
    expect(view(sample(), { query: 'mira', enabledScopes: ['group', 'tag'] }).matched).toBe(0);
  });

  it('cards and rows with no matches are hidden', () => {
    const tagged = view(sample(), { query: 'anna', enabledScopes: ['name'] });
    expect(tagged.cards.map((c) => c.id)).toEqual(['member', 'married']);
    expect(tagged.cards[0].rows.map((r) => r.label)).toEqual(['Thieves Guild']);
    expect(tagged.cards[0].rows[0].names.map((n) => n.label)).toEqual(['Anna']);
    const entity = view(sample(), { groupBy: 'entity', query: 'mira' });
    expect(entity.cards.map((c) => c.id)).toEqual(['inn']);
    expect(entity.cards[0].rows.map((r) => r.id)).toEqual(['member']);
  });

  it('total and matched count a mutual pair once, the same in both groupings', () => {
    for (const query of ['', 'zara']) {
      const byTag = view(sample(), { query, groupBy: 'tag' });
      const byEntity = view(sample(), { query, groupBy: 'entity' });
      expect(byTag.total).toBe(5);
      expect(byEntity.total).toBe(5);
      expect(byEntity.matched).toBe(byTag.matched);
    }
    expect(view(sample()).matched).toBe(5);
    expect(view(sample(), { query: 'zara' }).matched).toBe(2);
  });

  it('dragging is allowed only by entity with an empty query', () => {
    expect(view(sample(), { groupBy: 'entity' }).canDrag).toBe(true);
    expect(view(sample(), { groupBy: 'entity', query: '  ' }).canDrag).toBe(true);
    expect(view(sample(), { groupBy: 'entity', query: 'zara' }).canDrag).toBe(false);
    expect(view(sample(), { groupBy: 'tag' }).canDrag).toBe(false);
    expect(view(sample(), { groupBy: 'entity' }).listKey).toBe(entityCardsKey(tags.id));
    expect(view(sample(), { groupBy: 'tag' }).listKey).toBeNull();
  });
});

describe('visibleNames', () => {
  const items = Array.from({ length: 25 }, (_, i) => i);
  const idle = { expanded: false, searching: false };

  it('shows 10 names then the hidden count', () => {
    const { shown, hidden } = visibleNames(items, NAME_LIMIT, idle);
    expect(shown).toEqual(items.slice(0, 10));
    expect(hidden).toBe(15);
    expect(visibleNames(items.slice(0, 10), NAME_LIMIT, idle)).toEqual({
      shown: items.slice(0, 10),
      hidden: 0,
    });
  });

  it('shows 6 for mutual lists', () => {
    const { shown, hidden } = visibleNames(items, MUTUAL_LIMIT, idle);
    expect(shown).toHaveLength(6);
    expect(hidden).toBe(19);
  });

  it('shows everything when expanded', () => {
    expect(visibleNames(items, NAME_LIMIT, { expanded: true, searching: false })).toEqual({
      shown: items,
      hidden: 0,
    });
  });

  it('never truncates while searching', () => {
    expect(visibleNames(items, NAME_LIMIT, { expanded: false, searching: true })).toEqual({
      shown: items,
      hidden: 0,
    });
  });
});
