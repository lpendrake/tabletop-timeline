import { showContextMenu } from '../../shared/context-menu';
import type {
  GroupingMode,
  InnerRow as InnerRowModel,
  OuterRow as OuterRowModel,
  RowDragPayload,
  TrackRow as TrackRowModel,
} from '../domain';
import type { ValueCache } from '../domain';
import type { ParsedFileEntry } from '../hooks/use-relationships';
import { useRowDrag } from '../hooks/use-row-drag';
import type { EntityIndexEntry } from '../../../types/global';
import { EntityLink } from './entity-link';
import { InnerRow } from './inner-row';
import { buildRowMoveMenuItems } from './row-menu-items';

export interface OuterRowProps {
  row: OuterRowModel;
  mode: GroupingMode;
  isFirst: boolean;
  isLast: boolean;
  now: number;
  cache: ValueCache;
  labelFor: (id: string) => string;
  expanded: boolean;
  onToggle: () => void;
  isInnerExpanded: (row: InnerRowModel) => boolean;
  onToggleInner: (row: InnerRowModel) => void;
  isTrackExpanded: (row: TrackRowModel) => boolean;
  onToggleTrack: (row: TrackRowModel) => void;
  directivesFor: (path: string) => ParsedFileEntry | undefined;
  entityIndex: EntityIndexEntry[];
  onOpenById: (id: string) => void;
  onOpenEvent: (filename: string) => void;
  onMoveToTop: (payload: RowDragPayload) => void;
  onMoveUp: (payload: RowDragPayload) => void;
  onMoveDown: (payload: RowDragPayload) => void;
  onDrop: (dragged: RowDragPayload, position: 'before' | 'after', targetId: string) => void;
}

export function OuterRow({
  row,
  mode,
  isFirst,
  isLast,
  now,
  cache,
  labelFor,
  expanded,
  onToggle,
  isInnerExpanded,
  onToggleInner,
  isTrackExpanded,
  onToggleTrack,
  directivesFor,
  entityIndex,
  onOpenById,
  onOpenEvent,
  onMoveToTop,
  onMoveUp,
  onMoveDown,
  onDrop,
}: OuterRowProps) {
  const payload: RowDragPayload = { mode, level: 'outer', parentKey: '', id: row.key };
  const drag = useRowDrag(payload, onDrop);

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu(
      buildRowMoveMenuItems(
        {
          onMoveToTop: () => onMoveToTop(payload),
          onMoveUp: () => onMoveUp(payload),
          onMoveDown: () => onMoveDown(payload),
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
          onClick={onToggle}
          aria-expanded={expanded}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <EntityLink
          id={row.entityId}
          label={labelFor(row.entityId)}
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
              outerId={row.key}
              mode={mode}
              isFirst={index === 0}
              isLast={index === row.children.length - 1}
              now={now}
              cache={cache}
              labelFor={labelFor}
              expanded={isInnerExpanded(inner)}
              onToggle={() => onToggleInner(inner)}
              isTrackExpanded={isTrackExpanded}
              onToggleTrack={onToggleTrack}
              directivesFor={directivesFor}
              entityIndex={entityIndex}
              onOpenById={onOpenById}
              onOpenEvent={onOpenEvent}
              onMoveToTop={onMoveToTop}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
              onDrop={onDrop}
            />
          ))}
        </div>
      )}
      {drag.indicator === 'after' && <div className="rel-drop-indicator" />}
    </div>
  );
}
