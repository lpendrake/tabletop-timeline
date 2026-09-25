import { useCallback, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { canDrop, dropPosition, type DropTarget, type RowDragPayload } from '../domain';

/**
 * Native HTML5 drag-and-drop for reordering an outer or inner row within its
 * parent (see `folder-sidebar.tsx` for the sibling pattern that drags *onto*
 * a row to reparent; this one drags *between* rows to reorder).
 *
 * The full payload can only be read from `dataTransfer` on the `drop` event
 * — browsers block `getData` during `dragover` for security. So whether a
 * row currently being dragged over is a *valid* target (same mode/level/
 * parent — see `canDrop`) is decided during `dragover` using a second,
 * scope-encoding MIME type set at drag start: its mere *presence* in
 * `dataTransfer.types` is readable during `dragover`, even though its value
 * isn't. `drop` still re-validates with the real payload before doing
 * anything — the scoped MIME is only a fast, presence-only hint for the
 * insertion-indicator UI.
 */

const DRAG_MIME = 'application/x-relationships-row';

function scopeMime(target: DropTarget): string {
  return `${DRAG_MIME}-scope-${target.mode}-${target.level}-${encodeURIComponent(target.parentKey)}`.toLowerCase();
}

export interface UseRowDragResult {
  /** Where to show the insertion indicator relative to this row, or null. */
  indicator: 'before' | 'after' | null;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => void;
}

/**
 * `rowPayload` identifies this row itself (its own mode/level/parent/id) —
 * used both as the payload when a drag *starts* here, and as the target
 * (its mode/level/parent for `canDrop`, its id as the "move before/after
 * this" anchor) when something is dropped *on* it.
 */
export function useRowDrag(
  rowPayload: RowDragPayload,
  onDrop: (dragged: RowDragPayload, position: 'before' | 'after', targetId: string) => void,
): UseRowDragResult {
  const [indicator, setIndicator] = useState<'before' | 'after' | null>(null);
  const target: DropTarget = useMemo(
    () => ({ mode: rowPayload.mode, level: rowPayload.level, parentKey: rowPayload.parentKey }),
    [rowPayload.mode, rowPayload.level, rowPayload.parentKey],
  );
  const targetScope = useMemo(() => scopeMime(target), [target]);

  const handleDragStart = useCallback(
    (e: DragEvent) => {
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(rowPayload));
      e.dataTransfer.setData(scopeMime(target), '');
      e.dataTransfer.effectAllowed = 'move';
    },
    [rowPayload, target],
  );

  const handleDragEnd = useCallback(() => setIndicator(null), []);

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(targetScope)) {
        e.dataTransfer.dropEffect = 'none';
        setIndicator(null);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      const rect = e.currentTarget.getBoundingClientRect();
      setIndicator(dropPosition(e.clientY, rect));
    },
    [targetScope],
  );

  const handleDragLeave = useCallback(() => setIndicator(null), []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const position =
        indicator ?? dropPosition(e.clientY, e.currentTarget.getBoundingClientRect());
      setIndicator(null);

      const raw = e.dataTransfer.getData(DRAG_MIME);
      if (!raw) return;
      let dragged: RowDragPayload;
      try {
        dragged = JSON.parse(raw) as RowDragPayload;
      } catch {
        return;
      }
      if (!canDrop(dragged, target)) return;
      onDrop(dragged, position, rowPayload.id);
    },
    [indicator, target, rowPayload.id, onDrop],
  );

  return {
    indicator,
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  };
}
