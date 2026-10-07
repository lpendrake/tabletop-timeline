import { describe, it, expect } from 'vitest';
import {
  COLUMN_LIMITS,
  COLUMN_TITLES,
  DEFAULT_COLUMN_WIDTHS,
  KEY_RESIZE_STEP,
  columnTemplate,
  draggedWidth,
  keyResizedWidth,
  parseColumnWidths,
  resetColumn,
  resizeColumn,
  visibleColumns,
} from '../numeric-columns';

describe('numeric columns', () => {
  it("resizing clamps to each column's limits and rounds", () => {
    expect(resizeColumn(DEFAULT_COLUMN_WIDTHS, 'name', 1).name).toBe(COLUMN_LIMITS.name.min);
    expect(resizeColumn(DEFAULT_COLUMN_WIDTHS, 'name', 5000).name).toBe(COLUMN_LIMITS.name.max);
    expect(resizeColumn(DEFAULT_COLUMN_WIDTHS, 'entries', 0).entries).toBe(
      COLUMN_LIMITS.entries.min,
    );
    expect(resizeColumn(DEFAULT_COLUMN_WIDTHS, 'value', 70.6).value).toBe(71);
    expect(resizeColumn(DEFAULT_COLUMN_WIDTHS, 'value', 70.4).value).toBe(70);
    expect(resizeColumn(DEFAULT_COLUMN_WIDTHS, 'name', 300).last).toBe(DEFAULT_COLUMN_WIDTHS.last);
  });

  it('resizing to the same width returns the same object', () => {
    expect(resizeColumn(DEFAULT_COLUMN_WIDTHS, 'name', DEFAULT_COLUMN_WIDTHS.name)).toBe(
      DEFAULT_COLUMN_WIDTHS,
    );
    expect(resizeColumn(DEFAULT_COLUMN_WIDTHS, 'name', DEFAULT_COLUMN_WIDTHS.name + 0.2)).toBe(
      DEFAULT_COLUMN_WIDTHS,
    );
    expect(resizeColumn(DEFAULT_COLUMN_WIDTHS, 'name', 5000)).not.toBe(DEFAULT_COLUMN_WIDTHS);
  });

  it('a width that is not finite leaves the widths unchanged', () => {
    expect(resizeColumn(DEFAULT_COLUMN_WIDTHS, 'name', NaN)).toBe(DEFAULT_COLUMN_WIDTHS);
    expect(resizeColumn(DEFAULT_COLUMN_WIDTHS, 'name', Infinity)).toBe(DEFAULT_COLUMN_WIDTHS);
  });

  it('reset restores the default', () => {
    const wide = resizeColumn(DEFAULT_COLUMN_WIDTHS, 'name', 400);
    expect(resetColumn(wide, 'name')).toEqual(DEFAULT_COLUMN_WIDTHS);
    expect(resetColumn(DEFAULT_COLUMN_WIDTHS, 'name')).toBe(DEFAULT_COLUMN_WIDTHS);
  });

  it('parsing tolerates junk', () => {
    expect(parseColumnWidths(null)).toEqual(DEFAULT_COLUMN_WIDTHS);
    expect(parseColumnWidths(undefined)).toEqual(DEFAULT_COLUMN_WIDTHS);
    expect(parseColumnWidths('wide')).toEqual(DEFAULT_COLUMN_WIDTHS);
    expect(parseColumnWidths([1, 2, 3])).toEqual(DEFAULT_COLUMN_WIDTHS);
    expect(
      parseColumnWidths({
        name: NaN,
        last: Infinity,
        band: '120',
        value: null,
        entries: -Infinity,
      }),
    ).toEqual(DEFAULT_COLUMN_WIDTHS);
    expect(parseColumnWidths({ name: 300, bogus: 5 })).toEqual({
      ...DEFAULT_COLUMN_WIDTHS,
      name: 300,
    });
    expect(parseColumnWidths({ name: 1, value: 9999, last: 150.6 })).toEqual({
      ...DEFAULT_COLUMN_WIDTHS,
      name: COLUMN_LIMITS.name.min,
      value: COLUMN_LIMITS.value.max,
      last: 151,
    });
  });

  it('visible columns follow the display order and drop band without bands', () => {
    expect(visibleColumns(true)).toEqual(['entries', 'last', 'name', 'band', 'value']);
    expect(visibleColumns(false)).toEqual(['entries', 'last', 'name', 'value']);
  });

  it('the template lists the visible columns in display order, band only with bands', () => {
    expect(columnTemplate(DEFAULT_COLUMN_WIDTHS, true)).toBe('56px 170px 180px 96px 56px');
    expect(columnTemplate(DEFAULT_COLUMN_WIDTHS, false)).toBe('56px 170px 180px 56px');
    expect(columnTemplate({ ...DEFAULT_COLUMN_WIDTHS, band: 120, name: 300 }, true)).toBe(
      '56px 170px 300px 120px 56px',
    );
    expect(columnTemplate({ ...DEFAULT_COLUMN_WIDTHS, band: 120 }, false)).toBe(
      '56px 170px 180px 56px',
    );
  });

  it('every visible column has a title', () => {
    expect(visibleColumns(true).map((c) => COLUMN_TITLES[c])).toEqual([
      'Entries',
      'Last change',
      'Standing with',
      'Band',
      'Value',
    ]);
  });

  it('a dragged width moves with the pointer from where the drag started', () => {
    expect(draggedWidth(180, 400, 430)).toBe(210);
    expect(draggedWidth(180, 400, 370)).toBe(150);
    expect(draggedWidth(180, 400, 400)).toBe(180);
  });

  it('Left and Right nudge a width by the step, other keys do nothing', () => {
    expect(keyResizedWidth(100, 'ArrowRight')).toBe(100 + KEY_RESIZE_STEP);
    expect(keyResizedWidth(100, 'ArrowLeft')).toBe(100 - KEY_RESIZE_STEP);
    expect(keyResizedWidth(100, 'ArrowUp')).toBeNull();
    expect(keyResizedWidth(100, 'Enter')).toBeNull();
  });
});
