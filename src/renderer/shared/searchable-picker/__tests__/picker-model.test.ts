import { describe, it, expect } from 'vitest';
import {
  rankPickerOptions,
  moveHighlight,
  groupPickerOptions,
  flattenGroups,
  flatIndexOf,
  highlightSegments,
  type PickerOption,
} from '../picker-model';

const FOLDER_OPTIONS: PickerOption[] = [
  { id: 'npcs', path: 'npcs' },
  { id: 'factions', path: 'factions' },
  { id: 'factions/house-of-storms', path: 'factions/the-house-of-storms' },
  { id: 'factions/house-of-storms/spies', path: 'factions/the-house-of-storms/spies' },
  { id: 'locations', path: 'locations' },
];

describe('rankPickerOptions', () => {
  it('segment query finds a deep folder', () => {
    const results = rankPickerOptions(FOLDER_OPTIONS, 'storm/spies');
    expect(results[0]?.id).toBe('factions/house-of-storms/spies');
  });

  it('intermediate folders are selectable', () => {
    const results = rankPickerOptions(FOLDER_OPTIONS, 'storm');
    const ids = results.map((r) => r.id);
    expect(ids).toContain('factions/house-of-storms');
    expect(ids).toContain('factions/house-of-storms/spies');
  });

  it('prefix beats substring, ties keep input order', () => {
    const options: PickerOption[] = [
      { id: 'a', path: 'the-oracle' },
      { id: 'b', path: 'oracle-of-storms' },
      { id: 'c', path: 'oracle-town' },
    ];
    const results = rankPickerOptions(options, 'oracle');
    // 'oracle-of-storms' and 'oracle-town' both prefix-match; tie keeps input order.
    // 'the-oracle' is only a word-boundary substring match, ranked worse.
    expect(results.map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('empty query shows recents first then the rest', () => {
    const results = rankPickerOptions(FOLDER_OPTIONS, '', ['locations', 'does-not-exist', 'npcs']);
    expect(results.map((r) => r.id)).toEqual([
      'locations',
      'npcs',
      'factions',
      'factions/house-of-storms',
      'factions/house-of-storms/spies',
    ]);
  });

  it('recents do not reorder search results', () => {
    const results = rankPickerOptions(FOLDER_OPTIONS, 'storm', ['locations', 'npcs']);
    expect(results.map((r) => r.id)).toEqual([
      'factions/house-of-storms',
      'factions/house-of-storms/spies',
    ]);
  });

  it('limit caps results', () => {
    const results = rankPickerOptions(FOLDER_OPTIONS, '', undefined, 2);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id)).toEqual(['npcs', 'factions']);
  });

  it('whitespace-only query behaves like an empty query', () => {
    const results = rankPickerOptions(FOLDER_OPTIONS, '   ', ['npcs']);
    expect(results[0]?.id).toBe('npcs');
  });

  it('no matches returns an empty list', () => {
    expect(rankPickerOptions(FOLDER_OPTIONS, 'zzzznotfound')).toEqual([]);
  });
});

describe('moveHighlight', () => {
  it('moveHighlight wraps and handles empty', () => {
    expect(moveHighlight(0, 3, 1)).toBe(1);
    expect(moveHighlight(2, 3, 1)).toBe(0);
    expect(moveHighlight(0, 3, -1)).toBe(2);
    expect(moveHighlight(1, 3, -1)).toBe(0);
    expect(moveHighlight(0, 0, 1)).toBe(-1);
    expect(moveHighlight(-1, 0, -1)).toBe(-1);
  });
});

describe('groupPickerOptions', () => {
  const vanguard: PickerOption = { id: 'v', path: 'The Vanguard', count: 15 };
  const all: PickerOption = { id: 'a', path: 'All holders', count: 33 };
  const options: PickerOption[] = [
    { id: 'z', path: 'Zed', count: 20 },
    vanguard,
    { id: 'q', path: 'Quill', count: 2 },
  ];

  it('empty query shows pinned group then all group', () => {
    const groups = groupPickerOptions(options, '', { pinned: [all, vanguard] });
    expect(groups.map((g) => g.key)).toEqual(['pinned', 'all']);
    expect(groups[0].label).toBe('Pinned');
    expect(groups[1].label).toBe('All');
    expect(groups[0].options.map((o) => o.id)).toEqual(['a', 'v']);
    expect(groups[1].options.map((o) => o.id)).toEqual(['z', 'v', 'q']);
  });

  it('query filters both groups and drops empty groups', () => {
    const groups = groupPickerOptions(options, 'quil', { pinned: [all, vanguard] });
    expect(groups.map((g) => g.key)).toEqual(['all']);
    expect(groups[0].options.map((o) => o.id)).toEqual(['q']);
    expect(groupPickerOptions(options, 'nomatch', { pinned: [all] })).toEqual([]);
  });

  it('without pinned returns one unlabelled all group', () => {
    expect(groupPickerOptions(options, '')).toEqual([{ key: 'all', options }]);
  });

  it('an option in both pinned and all is navigable twice', () => {
    const groups = groupPickerOptions(options, '', { pinned: [all, vanguard] });
    const flat = flattenGroups(groups);
    expect(flat.map((e) => e.index)).toEqual([0, 1, 2, 3, 4]);
    const vanguardEntries = flat.filter((e) => e.option.id === 'v');
    expect(vanguardEntries.map((e) => [e.index, e.groupKey])).toEqual([
      [1, 'pinned'],
      [3, 'all'],
    ]);
    for (const e of flat) {
      expect(flatIndexOf(groups, e.groupIndex, e.optionIndex)).toBe(e.index);
    }
    expect(flatIndexOf(groups, 1, 9)).toBe(-1);
  });
});

describe('highlightSegments', () => {
  it('splits label into matched and unmatched segments', () => {
    expect(highlightSegments('The Vanguard', 'VAN')).toEqual([
      { text: 'The ', match: false },
      { text: 'Van', match: true },
      { text: 'guard', match: false },
    ]);
    expect(highlightSegments('Zed', '')).toEqual([{ text: 'Zed', match: false }]);
  });
});
