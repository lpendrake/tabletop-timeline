import { describe, it, expect } from 'vitest';
import { dropToMove, formatLastChange, historyEntryClasses } from '../row-display';

describe('row display', () => {
  it('last-change formatter signs adjust amounts and describes set/add/remove', () => {
    const at = '23 Gozran 4725';
    expect(formatLastChange({ delta: { op: 'adjust', by: 2 }, dateLabel: at })).toBe(`+2 ${at}`);
    expect(formatLastChange({ delta: { op: 'adjust', by: -3 }, dateLabel: at })).toBe(`−3 ${at}`);
    expect(formatLastChange({ delta: { op: 'set', value: 40 }, dateLabel: at })).toBe(`= 40 ${at}`);
    expect(formatLastChange({ delta: { op: 'set', value: ['a', 'b'] }, dateLabel: at })).toBe(
      `= a, b ${at}`,
    );
    expect(formatLastChange({ delta: { op: 'add', key: 'ally' }, dateLabel: at })).toBe(
      `+ ally ${at}`,
    );
    expect(formatLastChange({ delta: { op: 'remove', key: 'ally' }, dateLabel: at })).toBe(
      `− ally ${at}`,
    );
  });

  it('maps hit, dim and future entries to classes', () => {
    expect(historyEntryClasses({ hit: true, applied: true })).toBe('rel-entry is-hit');
    expect(historyEntryClasses({ hit: false, applied: false })).toBe('rel-entry is-dim is-future');
    expect(historyEntryClasses({ hit: null, applied: true })).toBe('rel-entry');
  });

  it('turns a drop position into a row move', () => {
    expect(dropToMove('before', 'x')).toEqual({ before: 'x' });
    expect(dropToMove('after', 'x')).toEqual({ after: 'x' });
  });
});
