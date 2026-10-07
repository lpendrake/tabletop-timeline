// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_COLUMN_WIDTHS, resizeColumn } from '../domain/column-widths';
import {
  loadColumnWidths,
  loadSelectedHolder,
  loadSelectedTab,
  saveColumnWidths,
  saveSelectedHolder,
  saveSelectedTab,
} from '../view-state-persistence';

describe('relationships view persistence', () => {
  beforeEach(() => localStorage.clear());

  it('persistence round-trips per campaign and per track; corrupt storage is empty', () => {
    expect(loadSelectedTab('/c1')).toBeNull();
    saveSelectedTab('/c1', 'at01');
    saveSelectedHolder('/c1', 'rp01', 'x');
    saveSelectedHolder('/c1', 'at01', '*');
    saveSelectedTab('/c2', 'tg01');
    expect(loadSelectedTab('/c1')).toBe('at01');
    expect(loadSelectedTab('/c2')).toBe('tg01');
    expect(loadSelectedHolder('/c1', 'rp01')).toBe('x');
    expect(loadSelectedHolder('/c1', 'at01')).toBe('*');
    expect(loadSelectedHolder('/c2', 'rp01')).toBeNull();

    localStorage.setItem('relationships-view:/c1', 'not-json');
    expect(loadSelectedTab('/c1')).toBeNull();
    expect(loadSelectedHolder('/c1', 'rp01')).toBeNull();
    saveSelectedTab('/c1', 'rp01');
    expect(loadSelectedTab('/c1')).toBe('rp01');
  });

  it('column widths persist per campaign and survive corrupt data', () => {
    expect(loadColumnWidths('/c1')).toEqual(DEFAULT_COLUMN_WIDTHS);
    saveSelectedTab('/c1', 'at01');
    saveSelectedHolder('/c1', 'rp01', 'x');
    const wide = resizeColumn(DEFAULT_COLUMN_WIDTHS, 'name', 300);
    saveColumnWidths('/c1', wide);
    expect(loadColumnWidths('/c1')).toEqual(wide);
    expect(loadColumnWidths('/c2')).toEqual(DEFAULT_COLUMN_WIDTHS);
    expect(loadSelectedTab('/c1')).toBe('at01');
    expect(loadSelectedHolder('/c1', 'rp01')).toBe('x');

    saveSelectedTab('/c1', 'tg01');
    expect(loadColumnWidths('/c1')).toEqual(wide);

    localStorage.setItem('relationships-view:/c1', 'not-json');
    expect(loadColumnWidths('/c1')).toEqual(DEFAULT_COLUMN_WIDTHS);
    localStorage.setItem('relationships-view:/c1', JSON.stringify({ columnWidths: 'junk' }));
    expect(loadColumnWidths('/c1')).toEqual(DEFAULT_COLUMN_WIDTHS);
    saveColumnWidths('/c1', wide);
    expect(loadColumnWidths('/c1')).toEqual(wide);
  });
});
