import { describe, it, expect } from 'vitest';
import {
  countLabel,
  emptyMessage,
  highlightRanges,
  historyEntryText,
  scopesForKind,
  searchRows,
  tokenise,
  type SearchableRow,
  type SearchScope,
} from '../search';

const ALL: SearchScope[] = ['name', 'band', 'event', 'reason'];

const rows: SearchableRow[] = [
  {
    key: 'a',
    fields: { name: 'Vanguard Keep', band: 'Friendly' },
    history: [
      { key: 'h1', event: 'Siege', reason: 'Spread the blight' },
      { key: 'h2', event: 'Feast', reason: 'Shared bread' },
    ],
  },
  { key: 'b', fields: { name: 'Harbor', band: 'Hostile' }, history: [] },
];

describe('search', () => {
  it('several words combine as AND across enabled fields', () => {
    expect(searchRows(rows, 'vanguard blight', ALL).matchedKeys).toEqual(new Set(['a']));
    expect(searchRows(rows, 'vanguard zzz', ALL).matchedKeys.size).toBe(0);
    expect(searchRows(rows, 'harbor blight', ALL).matchedKeys.size).toBe(0);
    expect(tokenise('  Foo  BAR ')).toEqual(['foo', 'bar']);
  });

  it('a disabled scope is not searched', () => {
    expect(searchRows(rows, 'friendly', ALL).matched).toBe(1);
    expect(searchRows(rows, 'friendly', ['name', 'event', 'reason']).matched).toBe(0);
  });

  it('reason falls back to the event title when empty', () => {
    const delta = {
      op: 'adjust' as const,
      by: 1,
      at: null,
      declaredIn: { path: 'e.md', ordinal: 0 },
      reason: '  ',
    };
    const text = historyEntryText(delta, new Map([['e.md', 'Siege of Vanguard']]));
    expect(text).toEqual({ event: 'Siege of Vanguard', reason: 'Siege of Vanguard' });
    const r: SearchableRow = { key: 'x', fields: {}, history: [{ key: 'h', ...text }] };
    expect(searchRows([r], 'siege', ['reason']).matched).toBe(1);
    expect(searchRows([r], 'siege', ['name']).matched).toBe(0);
  });

  it('matches through history report the matching entries', () => {
    const res = searchRows(rows, 'vanguard blight', ALL);
    expect(res.historyHits.get('a')).toEqual(new Set(['h1']));
  });

  it('row-level match without history yields no history hits', () => {
    const res = searchRows(rows, 'vanguard', ALL);
    expect(res.matched).toBe(1);
    expect(res.historyHits.size).toBe(0);
  });

  it('empty query matches everything', () => {
    const res = searchRows(rows, '   ', ALL);
    expect(res.matched).toBe(res.total);
    expect(res.historyHits.size).toBe(0);
  });

  it('highlightRanges finds every word case-insensitively and merges overlaps', () => {
    expect(highlightRanges('Blight of the blight', 'BLIGHT')).toEqual([
      [0, 6],
      [14, 20],
    ]);
    expect(highlightRanges('abcdef', 'abc cde')).toEqual([[0, 5]]);
    expect(highlightRanges('abc', '')).toEqual([]);
  });

  it('count label and empty message', () => {
    expect(countLabel(3, 15)).toBe('3 of 15');
    expect(emptyMessage('blight', false)).toBe('Nothing matches "blight"');
    expect(emptyMessage('blight', true)).toBe('Nothing matches "blight" in the enabled scopes');
    expect(scopesForKind('categorical')).toEqual(['name', 'group', 'tag']);
  });
});
