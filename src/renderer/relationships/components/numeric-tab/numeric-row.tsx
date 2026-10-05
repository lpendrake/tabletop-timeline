import type { CSSProperties } from 'react';
import type { NumericRowModel } from '../../domain/numeric-rows';
import type { PlotScale } from '../../domain/plot-scale';
import { dropIndicatorClass } from '../../domain/row-display';
import type { MoveRow } from '../../domain/view-order';
import type { ViewRow } from '../../domain/view-rows';
import { useRowReorder } from '../../hooks/use-row-drag';
import { EntityLink } from '../entity-link';
import { activateOnKey, DragHandle, dropTargetProps, openRowMoveMenu } from '../row-controls';
import { NumericPlot } from './numeric-plot';

export interface NumericRowProps {
  row: ViewRow;
  model: NumericRowModel;
  scale: PlotScale;
  canDrag: boolean;
  isFirst: boolean;
  isLast: boolean;
  moveRow: MoveRow;
  toggleRow: (listKey: string, observerId: string) => void;
  onOpenById: (id: string) => void;
}

/** Hands a colour (a theme-var CSS string) to the stylesheet as `--rel-num-colour`. */
export const colourStyle = (colour: string) => ({ '--rel-num-colour': colour }) as CSSProperties;

export function NumericRow(props: NumericRowProps) {
  const { row, model, scale, canDrag, isFirst, isLast, moveRow } = props;
  const drag = useRowReorder(row.listKey, row.observerId, moveRow);
  const toggle = () => props.toggleRow(row.listKey, row.observerId);
  return (
    <div
      className={`rel-row-wrap${dropIndicatorClass(drag.indicator)}`}
      {...dropTargetProps(drag, canDrag)}
    >
      <div
        className={`rel-num-row${row.onlyFuture ? ' is-future' : ''}`}
        style={colourStyle(model.colour)}
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
          <EntityLink
            id={row.observerId}
            label={row.label}
            onOpenById={props.onOpenById}
            className="rel-num-name"
          />
          <span className="rel-num-value" title={model.valueText}>
            {model.valueText}
          </span>
          {scale.hasBands && (
            <span className="rel-num-band-label" title={model.bandLabel ?? undefined}>
              {model.bandLabel}
            </span>
          )}
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
          <span className="rel-num-count">{model.entryCount}</span>
          <span className="rel-chevron" aria-hidden="true">
            {row.expanded ? '▾' : '▸'}
          </span>
        </div>
        <NumericPlot scale={scale} model={model} />
      </div>
      {row.expanded && <div className="rel-num-expanded">Change history will appear here.</div>}
    </div>
  );
}
