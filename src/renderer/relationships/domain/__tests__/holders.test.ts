import { describe, it, expect } from 'vitest';
import type { Ledger } from '../../../../shared/relationships/model';
import {
  allLabel,
  holdersForTrack,
  ledgersForHolder,
  pickerLabel,
  pinnedHolders,
  resolveSelectedHolder,
  showHolderPicker,
} from '../holders';

const l = (holder: string, observer: string, track = 'rp01'): Ledger => ({
  holder,
  observer,
  track,
  deltas: [],
});
const ledgers = [
  l('b', '1'),
  l('b', '2'),
  l('a', '1'),
  l('c', '1'),
  l('c', '2'),
  l('z', '1', 'at01'),
];
const label = (id: string) => id.toUpperCase();

describe('holders', () => {
  it('holders sorted by count with All and default pinned', () => {
    const holders = holdersForTrack(ledgers, 'rp01', label);
    expect(holders).toEqual([
      { id: 'b', count: 2 },
      { id: 'c', count: 2 },
      { id: 'a', count: 1 },
    ]);
    expect(showHolderPicker(holders)).toBe(true);
    expect(showHolderPicker(holders.slice(0, 1))).toBe(false);
    expect(pinnedHolders({ kind: 'numeric', total: 5, defaultHolderId: 'a', holders })).toEqual([
      { id: '*', count: 5 },
      { id: 'a', count: 1 },
    ]);
    expect(pinnedHolders({ kind: 'numeric', total: 5, defaultHolderId: 'q', holders })).toEqual([
      { id: '*', count: 5 },
    ]);
    expect(ledgersForHolder(ledgers, 'rp01', '*')).toHaveLength(5);
    expect(ledgersForHolder(ledgers, 'rp01', 'b')).toHaveLength(2);
  });

  it('saved holder falls back when it no longer exists', () => {
    const holders = holdersForTrack(ledgers, 'rp01', label);
    expect(resolveSelectedHolder('a', holders, 'c')).toBe('a');
    expect(resolveSelectedHolder('*', holders, 'c')).toBe('*');
    expect(resolveSelectedHolder('gone', holders, 'c')).toBe('c');
    expect(resolveSelectedHolder(null, holders, 'gone')).toBe('b');
    expect(resolveSelectedHolder('gone', [], 'c')).toBe('*');
  });

  it('picker labels Holder / Toward and All holders / Anyone', () => {
    expect(pickerLabel('numeric')).toBe('Holder');
    expect(pickerLabel('ordinal')).toBe('Toward');
    expect(pickerLabel('categorical')).toBe('Holder');
    expect(allLabel('numeric')).toBe('All holders');
    expect(allLabel('ordinal')).toBe('Anyone');
  });
});
