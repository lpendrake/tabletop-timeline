import { showContextMenu } from '../../shared/context-menu';
import type {
  InnerRow as InnerRowModel,
  OuterRow as OuterRowModel,
  RowDragPayload,
} from '../domain';
import { useRowDrag } from '../hooks/use-row-drag';
import { useRelationshipsViewContext } from '../relationships-context';
import { EntityLink } from './entity-link';
import { TrackRow } from './track-row';
import { buildRowMoveMenuItems } from './row-menu-items';

export interface InnerRowProps {
  row: InnerRowModel;
  outer: OuterRowModel;
  isFirst: boolean;
  isLast: boolean;
}

export function InnerRow({ row, outer, isFirst, isLast }: InnerRowProps) {
  const { state, onOpenById } = useRelationshipsViewContext();
  const mode = state.mode;

  const payload: RowDragPayload = { mode, level: 'inner', parentKey: outer.key, id: row.key };
  const onDrop = (dragged: RowDragPayload, position: 'before' | 'after', targetId: string) =>
    position === 'before'
      ? state.moveRowBefore(dragged, targetId)
      : state.moveRowAfter(dragged, targetId);
  const drag = useRowDrag(payload, onDrop);

  const expanded = state.isInnerExpanded(outer, row);

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
      className="rel-inner-row"
      onDragOver={drag.onDragOver}
      onDragLeave={drag.onDragLeave}
      onDrop={drag.onDrop}
      onContextMenu={handleContextMenu}
    >
      {drag.indicator === 'before' && <div className="rel-drop-indicator" />}
      <div className="rel-inner-header">
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
          onClick={() => state.toggleInner(outer, row)}
          aria-expanded={expanded}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <EntityLink
          id={row.entityId}
          label={state.labelFor(row.entityId)}
          onOpenById={onOpenById}
          className="rel-inner-label"
        />
      </div>
      {expanded && (
        <div className="rel-track-list">
          {row.tracks.map((track) => (
            <TrackRow key={track.key} row={track} />
          ))}
        </div>
      )}
      {drag.indicator === 'after' && <div className="rel-drop-indicator" />}
    </div>
  );
}
