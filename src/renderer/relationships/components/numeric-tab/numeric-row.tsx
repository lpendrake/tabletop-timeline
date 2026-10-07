import { Fragment, type ReactNode } from 'react';
import type { NumericTrack } from '../../../../shared/relationships';
import type { EntityIndexEntry } from '../../../../types/global';
import { visibleColumns, type NumericColumn } from '../../domain/numeric-columns';
import type { NumericRowModel } from '../../domain/numeric-rows';
import type { PlotScale } from '../../domain/plot-scale';
import { dropIndicatorClass } from '../../domain/row-display';
import type { MoveRow } from '../../domain/view-order';
import type { ViewRow } from '../../domain/view-rows';
import { useRowReorder } from '../../hooks/use-row-drag';
import { cssVars } from '../../../shared/css-vars';
import { EntityLink } from '../entity-link';
import { activateOnKey, DragHandle, dropTargetProps, openRowMoveMenu } from '../row-controls';
import { NumericHistory } from './numeric-history';
import { NumericPlot } from './numeric-plot';

export interface NumericRowProps {
  row: ViewRow;
  track: NumericTrack;
  model: NumericRowModel;
  scale: PlotScale;
  canDrag: boolean;
  /** Every second row of a group, tinted (with its history) so rows read apart across the info panel and the plot. */
  striped: boolean;
  isFirst: boolean;
  isLast: boolean;
  moveRow: MoveRow;
  toggleRow: (listKey: string, observerId: string) => void;
  now: number;
  query: string;
  entityIndex: readonly EntityIndexEntry[] | null;
  onOpenById: (id: string) => void;
  onOpenEvent: (filename: string) => void;
}

export function NumericRow(props: NumericRowProps) {
  const { row, model, scale, canDrag, striped, isFirst, isLast, moveRow } = props;
  const drag = useRowReorder(row.listKey, row.observerId, moveRow);
  const toggle = () => props.toggleRow(row.listKey, row.observerId);
  // Rendered in the order of the header's titles, which come from the same column list.
  const cells: Record<NumericColumn, ReactNode> = {
    entries: (
      <span className="rel-num-toggle">
        <span className="rel-num-arrow" aria-hidden="true">
          {row.expanded ? '▾' : '▸'}
        </span>
        <span className="rel-num-count">{model.entryCount}</span>
      </span>
    ),
    last: (
      <span className="rel-num-last" title={model.lastChange?.text}>
        {model.lastChange ? (
          <>
            <span className={`rel-num-amount is-${model.lastChange.tone}`}>
              {model.lastChange.amount}
            </span>{' '}
            <span className="rel-num-date">{model.lastChange.dateLabel}</span>
          </>
        ) : (
          '—'
        )}
      </span>
    ),
    name: (
      <EntityLink
        id={row.observerId}
        label={row.label}
        onOpenById={props.onOpenById}
        className="rel-num-name"
      />
    ),
    band: (
      <span className="rel-num-band-label" title={model.bandLabel ?? undefined}>
        {model.bandLabel}
      </span>
    ),
    value: (
      <span className="rel-num-value" title={model.valueText}>
        {model.valueText}
      </span>
    ),
  };
  return (
    <div
      className={`rel-row-wrap${striped ? ' is-striped' : ''}${dropIndicatorClass(drag.indicator)}`}
      {...dropTargetProps(drag, canDrag)}
    >
      <div
        className={`rel-num-row${row.onlyFuture ? ' is-future' : ''}`}
        style={cssVars({ '--rel-num-colour': model.colour })}
        role="button"
        tabIndex={0}
        aria-expanded={row.expanded}
        onClick={toggle}
        onKeyDown={(e) => activateOnKey(e, toggle)}
        onContextMenu={
          canDrag
            ? (e) => openRowMoveMenu(e, moveRow, row.listKey, row.observerId, isFirst, isLast)
            : undefined
        }
      >
        <div className="rel-num-left">
          {canDrag ? <DragHandle drag={drag} /> : <span />}
          {visibleColumns(scale.hasBands).map((column) => (
            <Fragment key={column}>{cells[column]}</Fragment>
          ))}
        </div>
        <NumericPlot scale={scale} model={model} />
      </div>
      {row.history && (
        <NumericHistory
          // A new search starts from its own open years.
          key={props.query}
          history={row.history}
          track={props.track}
          scale={scale}
          now={props.now}
          query={props.query}
          entityIndex={props.entityIndex}
          onOpenEvent={props.onOpenEvent}
          onOpenById={props.onOpenById}
        />
      )}
    </div>
  );
}
