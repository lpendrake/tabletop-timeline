import {
  COLUMN_LIMITS,
  COLUMN_TITLES,
  visibleColumns,
  type ColumnWidths,
  type NumericColumn,
} from '../../domain/numeric-columns';
import { columnSortOf, columnTitleLabel, type RowSort, type SortColumn } from '../../domain/sort';
import { useColumnResize } from '../../hooks/use-column-resize';

export interface NumericColumnHeaderProps {
  hasBands: boolean;
  widths: ColumnWidths;
  sortMode: RowSort;
  sortByColumn: (column: SortColumn) => void;
  setColumnWidth: (column: NumericColumn, width: number) => void;
  resetColumnWidth: (column: NumericColumn) => void;
}

/** The info panel's column titles: each sorts by its column when clicked and has a grip on its right edge to resize it. */
export function NumericColumnHeader(props: NumericColumnHeaderProps) {
  const { hasBands, widths, sortMode, sortByColumn } = props;
  const gripProps = useColumnResize(props);
  return (
    <div className="rel-num-left">
      <span />
      {visibleColumns(hasBands).map((column) => {
        const dir = columnSortOf(sortMode, column);
        const title = COLUMN_TITLES[column];
        return (
          <div key={column} className={`rel-num-th is-${column}`}>
            <button
              type="button"
              className="rel-num-title"
              aria-label={columnTitleLabel(title, dir)}
              onClick={() => sortByColumn(column)}
            >
              <span className="rel-num-title-label">{title}</span>
              {dir && (
                <span className="rel-num-sort-arrow" aria-hidden="true">
                  {dir === 'asc' ? '▲' : '▼'}
                </span>
              )}
            </button>
            <span
              className="rel-num-grip"
              role="separator"
              aria-orientation="vertical"
              aria-label={`Resize ${title} column`}
              aria-valuenow={widths[column]}
              aria-valuemin={COLUMN_LIMITS[column].min}
              aria-valuemax={COLUMN_LIMITS[column].max}
              tabIndex={0}
              title="Drag to resize, double-click to reset"
              {...gripProps(column, widths[column])}
            />
          </div>
        );
      })}
    </div>
  );
}
