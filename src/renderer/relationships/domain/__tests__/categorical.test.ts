import { describe, expect, it } from 'vitest';
import {
  MUTUAL_LIMIT,
  NAME_LIMIT,
  deriveCategoricalView,
  groupByChoiceKey,
  nameListId,
  findShownName,
  isSearching,
  listLimit,
  nameTag,
  parseGroupBy,
  toggledId,
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

describe('groupByChoiceKey', () => {
  it('differs by campaign and by track', () => {
    const key = groupByChoiceKey('/camp-a', 'tg01');
    expect(groupByChoiceKey('/camp-b', 'tg01')).not.toBe(key);
    expect(groupByChoiceKey('/camp-a', 'tg02')).not.toBe(key);
    expect(groupByChoiceKey('/camp-a', 'tg01')).toBe(key);
  });

  it('does not collide when path and track id are split differently', () => {
    expect(groupByChoiceKey('/a:b', 'c')).not.toBe(groupByChoiceKey('/a', 'b:c'));
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
    expect(view(sample(), { groupBy: 'entity', query: ' ' }).listKey).toBe(entityCardsKey(tags.id));
    expect(view(sample(), { groupBy: 'entity', query: 'zara' }).listKey).toBeNull();
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

describe('nameListId', () => {
  it('differs by grouping, card and row', () => {
    const ids = [
      nameListId('tag', 'member', 'guild'),
      nameListId('entity', 'member', 'guild'),
      nameListId('tag', 'guild', 'member'),
      nameListId('tag', 'married', null),
    ];
    expect(new Set(ids).size).toBe(4);
  });
});

describe('findShownName', () => {
  const collapsed = { expanded: new Set<string>(), searching: false };
  const members = (count: number) =>
    Array.from({ length: count }, (_, i) =>
      holds(`p${String(i + 1).padStart(2, '0')}`, 'guild', 'member'),
    );
  const keyOf = (v: CategoricalView, holderId: string) =>
    v.cards
      .flatMap((c) => [
        ...c.rows.flatMap((r) => r.names),
        ...(c.pairs ?? []).flatMap((p) => [p.a, p.b]),
      ])
      .find((n) => n.holderId === holderId)!.entryKey;

  it('finds a listed name, including both sides of a mutual pair', () => {
    const v = view(sample());
    const zara = findShownName(v, keyOf(v, 'zara'), collapsed);
    expect(zara?.holderId).toBe('zara');
    const pair = v.cards.find((c) => c.pairs)!.pairs![0];
    expect(findShownName(v, pair.a.entryKey, collapsed)).toBe(pair.a);
    expect(findShownName(v, pair.b.entryKey, collapsed)).toBe(pair.b);
    expect(findShownName(v, 'nope', collapsed)).toBeNull();
  });

  it('returns the current name from the view it is given', () => {
    const before = view(sample());
    const key = keyOf(before, 'zara');
    const after = view([...sample(), holds('zara', 'guild', 'member', { at: 5 })]);
    expect(findShownName(after, key, collapsed)).toBe(
      after.cards.flatMap((c) => c.rows.flatMap((r) => r.names)).find((n) => n.entryKey === key),
    );
    expect(findShownName(after, key, collapsed)).not.toBe(findShownName(before, key, collapsed));
  });

  it('does not find a name hidden by truncation until the list is expanded or searched', () => {
    const v = view(members(NAME_LIMIT + 2));
    const [card] = v.cards;
    const row = card.rows[0];
    const last = row.names[row.names.length - 1];
    const first = row.names[0];
    expect(findShownName(v, last.entryKey, collapsed)).toBeNull();
    expect(findShownName(v, first.entryKey, collapsed)).toBe(first);
    const expanded = new Set([nameListId('tag', card.id, row.id)]);
    expect(findShownName(v, last.entryKey, { expanded, searching: false })).toBe(last);
    expect(findShownName(v, last.entryKey, { expanded: new Set(), searching: true })).toBe(last);
    expect(
      findShownName(v, last.entryKey, { expanded: new Set(['other']), searching: false }),
    ).toBeNull();
  });

  it('truncates a mutual card at the mutual limit', () => {
    const couples = Array.from({ length: MUTUAL_LIMIT + 1 }, (_, i) =>
      mutualPair(`m${i + 1}`, `n${i + 1}`, 'married'),
    ).flat();
    const v = view(couples);
    const card = v.cards[0];
    expect(findShownName(v, card.pairs![MUTUAL_LIMIT].a.entryKey, collapsed)).toBeNull();
    expect(findShownName(v, card.pairs![MUTUAL_LIMIT - 1].b.entryKey, collapsed)).not.toBeNull();
    const expanded = new Set([nameListId('tag', card.id, null)]);
    expect(
      findShownName(v, card.pairs![MUTUAL_LIMIT].a.entryKey, { expanded, searching: false }),
    ).not.toBeNull();
  });
});

describe('isSearching, listLimit and nameTag', () => {
  it('a blank query is not a search', () => {
    expect(isSearching('')).toBe(false);
    expect(isSearching('  ')).toBe(false);
    expect(isSearching('a')).toBe(true);
  });

  it('mutual lists are shorter', () => {
    expect(listLimit(false)).toBe(NAME_LIMIT);
    expect(listLimit(true)).toBe(MUTUAL_LIMIT);
  });

  it("nameTag gives the chip and mutuality of the name's option", () => {
    const v = view(sample());
    const names = v.cards.flatMap((c) => c.rows.flatMap((r) => r.names));
    const member = names.find((n) => n.option === 'member')!;
    const married = v.cards.find((c) => c.pairs)!.pairs![0].a;
    expect(nameTag(tags, member)).toMatchObject({ chip: { key: 'member' }, mutual: false });
    expect(nameTag(tags, married)).toMatchObject({ chip: { key: 'married' }, mutual: true });
  });
});

describe('toggledId', () => {
  it('adds a missing id, removes a present one, and leaves the input alone', () => {
    const ids = new Set(['a']);
    expect([...toggledId(ids, 'b')]).toEqual(['a', 'b']);
    expect([...toggledId(ids, 'a')]).toEqual([]);
    expect([...ids]).toEqual(['a']);
  });
});
