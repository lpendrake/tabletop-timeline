/**
 * The numeric tab's info-panel columns: their order, titles, pixel widths and resize arithmetic.
 *
 * Limits keep content legible: entries fits the boxed `▸ 999`, last change fits a short date,
 * name can grow for long entity names, band fits a one-word label, value fits a signed number.
 * The drag handle is fixed and not part of this model.
 */

/** Display order, left to right; the single source of truth for the column list. */
const COLUMN_ORDER = ['entries', 'last', 'name', 'band', 'value'] as const;

export type NumericColumn = (typeof COLUMN_ORDER)[number];
export type ColumnWidths = Readonly<Record<NumericColumn, number>>;

/** Title shown over each column and sorted by when clicked. */
export const COLUMN_TITLES: Readonly<Record<NumericColumn, string>> = {
  entries: 'Entries',
  last: 'Last change',
  name: 'Standing with',
  band: 'Band',
  value: 'Value',
};

/** Pixels a column grows or shrinks per Left/Right press on its resize grip. */
export const KEY_RESIZE_STEP = 8;

export const DEFAULT_COLUMN_WIDTHS: ColumnWidths = {
  entries: 56,
  last: 170,
  name: 180,
  band: 96,
  value: 56,
};

export const COLUMN_LIMITS: Readonly<Record<NumericColumn, { min: number; max: number }>> = {
  entries: { min: 44, max: 96 },
  last: { min: 90, max: 260 },
  name: { min: 80, max: 480 },
  band: { min: 64, max: 200 },
  value: { min: 44, max: 120 },
};

function clampWidth(column: NumericColumn, width: number): number {
  const { min, max } = COLUMN_LIMITS[column];
  return Math.min(max, Math.max(min, Math.round(width)));
}

/** Clamps and rounds `width`; a width that isn't finite leaves `widths` unchanged. */
export function resizeColumn(
  widths: ColumnWidths,
  column: NumericColumn,
  width: number,
): ColumnWidths {
  if (!Number.isFinite(width)) return widths;
  const next = clampWidth(column, width);
  return next === widths[column] ? widths : { ...widths, [column]: next };
}

export function resetColumn(widths: ColumnWidths, column: NumericColumn): ColumnWidths {
  const next = DEFAULT_COLUMN_WIDTHS[column];
  return next === widths[column] ? widths : { ...widths, [column]: next };
}

/** Tolerant of anything read from storage: invalid values fall back to defaults, out-of-range values are clamped. */
export function parseColumnWidths(raw: unknown): ColumnWidths {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return DEFAULT_COLUMN_WIDTHS;
  const record = raw as Record<string, unknown>;
  const parsed = { ...DEFAULT_COLUMN_WIDTHS } as Record<NumericColumn, number>;
  for (const column of COLUMN_ORDER) {
    const value = record[column];
    if (typeof value === 'number' && Number.isFinite(value)) {
      parsed[column] = clampWidth(column, value);
    }
  }
  return parsed;
}

export function visibleColumns(hasBands: boolean): readonly NumericColumn[] {
  return hasBands ? COLUMN_ORDER : COLUMN_ORDER.filter((column) => column !== 'band');
}

/** The CSS `grid-template-columns` of the visible columns, e.g. `56px 170px 180px 96px 56px`. */
export function columnTemplate(widths: ColumnWidths, hasBands: boolean): string {
  return visibleColumns(hasBands)
    .map((column) => `${widths[column]}px`)
    .join(' ');
}

/** The width of a column being dragged: its width when the drag started, moved by the pointer's travel. */
export function draggedWidth(startWidth: number, startX: number, x: number): number {
  return startWidth + (x - startX);
}

/** The width after Left/Right on a grip, or null for any other key. */
export function keyResizedWidth(width: number, key: string): number | null {
  if (key === 'ArrowLeft') return width - KEY_RESIZE_STEP;
  if (key === 'ArrowRight') return width + KEY_RESIZE_STEP;
  return null;
}
