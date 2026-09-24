import { describe, it, expect } from 'vitest';
import { rankPickerOptions, moveHighlight, type PickerOption } from '../picker-model';

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
