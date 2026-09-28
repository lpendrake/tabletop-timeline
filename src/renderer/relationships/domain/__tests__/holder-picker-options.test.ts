import { describe, it, expect } from 'vitest';
import { holderPickerOptions } from '../holders';

describe('holderPickerOptions', () => {
  it('holder entries convert to picker options with All sentinel pinned', () => {
    const labels: Record<string, string> = { a: 'Alpha', b: 'Beta' };
    const result = holderPickerOptions({
      holders: [
        { id: 'a', count: 5 },
        { id: 'b', count: 2 },
      ],
      pinned: [
        { id: '*', count: 7 },
        { id: 'a', count: 5 },
      ],
      allHoldersLabel: 'All holders',
      labelFor: (id) => labels[id],
    });
    expect(result.pinned).toEqual([
      { id: '*', path: 'All holders', label: 'All holders', count: 7 },
      { id: 'a', path: 'Alpha', label: 'Alpha', count: 5 },
    ]);
    expect(result.options.map((o) => [o.id, o.label, o.count])).toEqual([
      ['a', 'Alpha', 5],
      ['b', 'Beta', 2],
    ]);
  });
});
