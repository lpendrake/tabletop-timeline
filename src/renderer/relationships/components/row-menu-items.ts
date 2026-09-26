import type { ContextMenuItem } from '../../shared/context-menu';

export interface RowMoveHandlers {
  onMoveToTop: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

/** The "Move to top / Move up / Move down" items every draggable row's context menu offers. */
export function buildRowMoveMenuItems(
  handlers: RowMoveHandlers,
  isFirst: boolean,
  isLast: boolean,
): ContextMenuItem[] {
  return [
    { kind: 'action', label: 'Move to top', onSelect: handlers.onMoveToTop, disabled: isFirst },
    { kind: 'action', label: 'Move up', onSelect: handlers.onMoveUp, disabled: isFirst },
    { kind: 'action', label: 'Move down', onSelect: handlers.onMoveDown, disabled: isLast },
  ];
}
