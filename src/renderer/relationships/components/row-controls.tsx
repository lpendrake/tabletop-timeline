import type { KeyboardEvent, MouseEvent } from 'react';
import { showContextMenu } from '../../shared/context-menu';
import type { MoveRow } from '../domain/view-order';
import type { UseRowDragResult } from '../hooks/use-row-drag';
import { buildRowMoveMenuItems } from './row-menu-items';

/** Runs `action` on Enter/Space, only when the key was pressed on the element itself (not a child). */
export function activateOnKey(e: KeyboardEvent<HTMLElement>, action: () => void) {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    action();
  }
}

/** Opens the "Move to top / up / down" context menu at the pointer. */
export function openRowMoveMenu(
  e: MouseEvent,
  moveRow: MoveRow,
  listKey: string,
  id: string,
  isFirst: boolean,
  isLast: boolean,
) {
  e.preventDefault();
  showContextMenu(
    buildRowMoveMenuItems(
      {
        onMoveToTop: () => moveRow(listKey, id, 'top'),
        onMoveUp: () => moveRow(listKey, id, 'up'),
        onMoveDown: () => moveRow(listKey, id, 'down'),
      },
      isFirst,
      isLast,
    ),
    e.clientX,
    e.clientY,
  );
}

/** The ⠿ grip a row or group header is dragged by. */
export function DragHandle({ drag }: { drag: UseRowDragResult }) {
  return (
    <span
      className="rel-drag-handle"
      draggable
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      onClick={(e) => e.stopPropagation()}
    >
      ⠿
    </span>
  );
}

/** Drop-target handlers for a row, or none when reordering is unavailable. */
export function dropTargetProps(drag: UseRowDragResult, canDrag: boolean) {
  if (!canDrag) return {};
  return { onDragOver: drag.onDragOver, onDragLeave: drag.onDragLeave, onDrop: drag.onDrop };
}
