import { dropIndicatorClass } from '../domain/row-display';
import type { MoveRow } from '../domain/view-order';
import type { ViewGroup } from '../domain/view-rows';
import { useRowReorder } from '../hooks/use-row-drag';
import { activateOnKey, DragHandle, dropTargetProps, openRowMoveMenu } from './row-controls';

export interface GroupHeaderProps {
  group: ViewGroup;
  groupsListKey: string;
  canDrag: boolean;
  moveRow: MoveRow;
  isFirst: boolean;
  isLast: boolean;
  toggleGroup: (holderId: string) => void;
}

export function GroupHeader(props: GroupHeaderProps) {
  const { group, groupsListKey, canDrag, moveRow, isFirst, isLast } = props;
  const drag = useRowReorder(groupsListKey, group.holderId, moveRow);
  const toggle = () => props.toggleGroup(group.holderId);
  return (
    <div
      className={`rel-group-header${dropIndicatorClass(drag.indicator)}`}
      tabIndex={0}
      aria-expanded={!group.collapsed}
      onClick={toggle}
      onKeyDown={(e) => activateOnKey(e, toggle)}
      {...dropTargetProps(drag, canDrag)}
      onContextMenu={
        canDrag
          ? (e) => openRowMoveMenu(e, moveRow, groupsListKey, group.holderId, isFirst, isLast)
          : undefined
      }
    >
      {canDrag && <DragHandle drag={drag} />}
      <span className="rel-chevron" aria-hidden="true">
        {group.collapsed ? '▸' : '▾'}
      </span>
      <span className="rel-group-name">{group.label}</span>
      <span className="rel-group-count">standing with {group.rows.length}</span>
    </div>
  );
}
