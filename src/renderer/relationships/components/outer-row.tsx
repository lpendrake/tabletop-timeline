import { showContextMenu } from '../../shared/context-menu';
import type { OuterRow as OuterRowModel, RowDragPayload } from '../domain';
import { useRowDrag } from '../hooks/use-row-drag';
import { useRelationshipsViewContext } from '../relationships-context';
import { EntityLink } from './entity-link';
import { InnerRow } from './inner-row';
import { buildRowMoveMenuItems } from './row-menu-items';

export interface OuterRowProps {
  row: OuterRowModel;
  isFirst: boolean;
  isLast: boolean;
}

export function OuterRow({ row, isFirst, isLast }: OuterRowProps) {
  const { state, onOpenById } = useRelationshipsViewContext();
  const mode = state.mode;

  const payload: RowDragPayload = { mode, level: 'outer', parentKey: '', id: row.key };
  const onDrop = (dragged: RowDragPayload, position: 'before' | 'after', targetId: string) =>
    position === 'before'
      ? state.moveRowBefore(dragged, targetId)
      : state.moveRowAfter(dragged, targetId);
  const drag = useRowDrag(payload, onDrop);

  const expanded = state.isOuterExpanded(row);

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu(
      buildRowMoveMenuItems(
        {
          onMoveToTop: () => state.moveRowToTop(payload),
          onMoveUp: () => state.moveRowUp(payload),
          onMoveDown: () => state.moveRowDown(payload),
        },
        isFirst,
        isLast,
      ),
      e.clientX,
      e.clientY,
    );
  }

  return (
    <div
      className="rel-outer-row"
      onDragOver={drag.onDragOver}
      onDragLeave={drag.onDragLeave}
      onDrop={drag.onDrop}
      onContextMenu={handleContextMenu}
    >
      {drag.indicator === 'before' && <div className="rel-drop-indicator" />}
      <div className="rel-outer-header">
        <span
          className="rel-drag-handle"
          draggable
          onDragStart={drag.onDragStart}
          onDragEnd={drag.onDragEnd}
          title="Drag to reorder"
          aria-hidden="true"
        >
          ⠿
        </span>
        <button
          type="button"
          className="rel-expand-toggle"
          onClick={() => state.toggleOuter(row)}
          aria-expanded={expanded}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <EntityLink
          id={row.entityId}
          label={state.labelFor(row.entityId)}
          onOpenById={onOpenById}
          className="rel-outer-label"
        />
      </div>
      {expanded && (
        <div className="rel-inner-list">
          {row.children.map((inner, index) => (
            <InnerRow
              key={inner.key}
              row={inner}
              outer={row}
              isFirst={index === 0}
              isLast={index === row.children.length - 1}
            />
          ))}
        </div>
      )}
      {drag.indicator === 'after' && <div className="rel-drop-indicator" />}
    </div>
  );
}
