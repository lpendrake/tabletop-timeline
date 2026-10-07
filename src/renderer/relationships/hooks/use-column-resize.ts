import { useRef, type KeyboardEvent, type MutableRefObject, type PointerEvent } from 'react';
import { draggedWidth, keyResizedWidth, type NumericColumn } from '../domain/numeric-columns';

export interface ColumnResizeActions {
  setColumnWidth(column: NumericColumn, width: number): void;
  resetColumnWidth(column: NumericColumn): void;
}

interface Drag {
  column: NumericColumn;
  pointerId: number;
  startWidth: number;
  startX: number;
}

/** Handlers for the resize grip of `column`, currently `width` wide. */
function gripHandlers(
  dragRef: MutableRefObject<Drag | null>,
  { setColumnWidth, resetColumnWidth }: ColumnResizeActions,
  column: NumericColumn,
  width: number,
) {
  const end = (e: PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      // Keeps the drag from starting a text selection.
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { column, pointerId: e.pointerId, startWidth: width, startX: e.clientX };
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (drag?.column === column && drag.pointerId === e.pointerId) {
        setColumnWidth(column, draggedWidth(drag.startWidth, drag.startX, e.clientX));
      }
    },
    onPointerUp: end,
    onLostPointerCapture: end,
    onDoubleClick: () => resetColumnWidth(column),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      const next = keyResizedWidth(width, e.key);
      if (next === null) return;
      e.preventDefault();
      setColumnWidth(column, next);
    },
  };
}

/**
 * Pointer-drag, double-click reset and Left/Right handling for column resize grips: call the
 * result with a column and its current width for that grip's props. Wiring only; the width
 * arithmetic is in `domain/numeric-columns.ts`.
 */
export function useColumnResize(actions: ColumnResizeActions) {
  const dragRef = useRef<Drag | null>(null);
  return (column: NumericColumn, width: number) => gripHandlers(dragRef, actions, column, width);
}
