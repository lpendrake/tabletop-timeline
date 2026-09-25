import { showContextMenu } from '../../shared/context-menu';
import type {
  GroupingMode,
  InnerRow as InnerRowModel,
  RowDragPayload,
  TrackRow as TrackRowModel,
} from '../domain';
import type { ValueCache } from '../domain';
import type { ParsedFileEntry } from '../hooks/use-relationships';
import { useRowDrag } from '../hooks/use-row-drag';
import type { EntityIndexEntry } from '../../../types/global';
import { EntityLink } from './entity-link';
import { TrackRow } from './track-row';
import { buildRowMoveMenuItems } from './row-menu-items';

export interface InnerRowProps {
  row: InnerRowModel;
  outerId: string;
  mode: GroupingMode;
  isFirst: boolean;
  isLast: boolean;
  now: number;
  cache: ValueCache;
  labelFor: (id: string) => string;
  expanded: boolean;
  onToggle: () => void;
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

export function InnerRow({
  row,
  outerId,
  mode,
  isFirst,
  isLast,
  now,
  cache,
  labelFor,
  expanded,
  onToggle,
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
}: InnerRowProps) {
  const payload: RowDragPayload = { mode, level: 'inner', parentKey: outerId, id: row.key };
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
          onClick={onToggle}
          aria-expanded={expanded}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <EntityLink
          id={row.entityId}
          label={labelFor(row.entityId)}
          onOpenById={onOpenById}
          className="rel-inner-label"
        />
      </div>
      {expanded && (
        <div className="rel-track-list">
          {row.tracks.map((track) => (
            <TrackRow
              key={track.key}
              row={track}
              now={now}
              cache={cache}
              labelFor={labelFor}
              expanded={isTrackExpanded(track)}
              onToggle={() => onToggleTrack(track)}
              directivesFor={directivesFor}
              entityIndex={entityIndex}
              onOpenById={onOpenById}
              onOpenEvent={onOpenEvent}
            />
          ))}
        </div>
      )}
      {drag.indicator === 'after' && <div className="rel-drop-indicator" />}
    </div>
  );
}
