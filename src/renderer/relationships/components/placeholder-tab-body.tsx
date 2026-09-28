// TEMPORARY placeholder layout for #274. It will be fully removed and replaced by the per-kind layouts in #275–#278; do not build on it.
import type { KeyboardEvent, MouseEvent } from 'react';
import type { InvalidDirectiveEntry } from '../../../shared/relationships';
import type { EntityIndexEntry } from '../../../types/global';
import { showContextMenu } from '../../shared/context-menu';
import {
  dropToMove,
  formatDeltaChange,
  formatLastChange,
  historyEntryClasses,
} from '../domain/row-display';
import { resolveStepOpenTarget } from '../domain/step-open-target';
import { emptyStateParts } from '../domain/tabs';
import type { RowMove } from '../domain/view-order';
import type { HistoryEntry, ViewGroup, ViewRow } from '../domain/view-rows';
import { useRowDrag } from '../hooks/use-row-drag';
import { EntityLink } from './entity-link';
import { HighlightText } from './highlight-text';
import { buildRowMoveMenuItems } from './row-menu-items';
import './placeholder-tab-body.css';

export interface PlaceholderTabBodyProps {
  groups: ViewGroup[];
  groupsListKey: string | null;
  canDrag: boolean;
  query: string;
  emptyMessage: string | null;
  emptyStateTrackName: string;
  trackProblems: InvalidDirectiveEntry[];
  toggleRow: (listKey: string, observerId: string) => void;
  toggleGroup: (holderId: string) => void;
  moveRow: (listKey: string, id: string, to: RowMove) => void;
  onOpenById: (id: string) => void;
  onOpenEvent: (filename: string) => void;
  entityIndex: EntityIndexEntry[] | null;
}

interface DragProps {
  canDrag: boolean;
  moveRow: (listKey: string, id: string, to: RowMove) => void;
}

function activateOnKey(e: KeyboardEvent<HTMLElement>, action: () => void) {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    action();
  }
}

function openMoveMenu(
  e: MouseEvent,
  moveRow: DragProps['moveRow'],
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

function EntryItem(props: {
  entry: HistoryEntry;
  query: string;
  entityIndex: EntityIndexEntry[] | null;
  onOpenById: (id: string) => void;
  onOpenEvent: (filename: string) => void;
}) {
  const { entry, query, entityIndex, onOpenById, onOpenEvent } = props;
  const openTitle = (e: MouseEvent) => {
    e.stopPropagation();
    const target = resolveStepOpenTarget(entry.delta.declaredIn.path, entityIndex ?? []);
    if (target.kind === 'event') onOpenEvent(target.filename);
    else if (target.kind === 'note') onOpenById(target.entityId);
  };
  return (
    <li className={historyEntryClasses(entry)}>
      <span className="rel-entry-date">{entry.dateLabel}</span>
      <span className="rel-entry-change">
        {formatDeltaChange(entry.delta)} → {entry.runningFormatted}
      </span>
      {entry.eventTitle && (
        <span className="rel-entry-event" onClick={openTitle}>
          <HighlightText text={entry.eventTitle} query={query} />
        </span>
      )}
      {entry.reason && (
        <span className="rel-entry-reason">
          <HighlightText text={entry.reason} query={query} />
        </span>
      )}
      {entry.mirrored && <span className="rel-entry-mirrored">(mirrored)</span>}
    </li>
  );
}

function Row(
  props: DragProps & {
    row: ViewRow;
    isFirst: boolean;
    isLast: boolean;
    query: string;
    entityIndex: EntityIndexEntry[] | null;
    toggleRow: PlaceholderTabBodyProps['toggleRow'];
    onOpenById: (id: string) => void;
    onOpenEvent: (filename: string) => void;
  },
) {
  const { row, canDrag, moveRow, isFirst, isLast, query } = props;
  const drag = useRowDrag({ listKey: row.listKey, id: row.observerId }, (dragged, position, id) =>
    moveRow(row.listKey, dragged.id, dropToMove(position, id)),
  );
  const toggle = () => props.toggleRow(row.listKey, row.observerId);
  return (
    <div
      className={`rel-row-wrap${drag.indicator ? ` drop-${drag.indicator}` : ''}`}
      onDragOver={canDrag ? drag.onDragOver : undefined}
      onDragLeave={canDrag ? drag.onDragLeave : undefined}
      onDrop={canDrag ? drag.onDrop : undefined}
    >
      <div
        className={`rel-row${row.onlyFuture ? ' is-future' : ''}`}
        tabIndex={0}
        aria-expanded={row.expanded}
        onClick={toggle}
        onKeyDown={(e) => activateOnKey(e, toggle)}
        onContextMenu={
          canDrag
            ? (e) => openMoveMenu(e, moveRow, row.listKey, row.observerId, isFirst, isLast)
            : undefined
        }
      >
        {canDrag && (
          <span
            className="rel-drag-handle"
            draggable
            onDragStart={drag.onDragStart}
            onDragEnd={drag.onDragEnd}
            onClick={(e) => e.stopPropagation()}
          >
            ⠿
          </span>
        )}
        <EntityLink
          id={row.observerId}
          label={row.label}
          onOpenById={props.onOpenById}
          className="rel-row-name"
        />
        <span className="rel-row-value" style={{ color: row.colour }}>
          {row.formatted}
        </span>
        <span className="rel-row-state" style={{ color: row.colour }}>
          {row.stateLabel}
        </span>
        <span className="rel-row-last">
          {row.lastChange ? formatLastChange(row.lastChange) : ''}
        </span>
        <span className="rel-row-count">{row.entryCount}</span>
        <span className="rel-chevron" aria-hidden="true">
          {row.expanded ? '▾' : '▸'}
        </span>
      </div>
      {row.history && (
        <ul className="rel-entries">
          {row.history.map((entry) => (
            <EntryItem
              key={entry.key}
              entry={entry}
              query={query}
              entityIndex={props.entityIndex}
              onOpenById={props.onOpenById}
              onOpenEvent={props.onOpenEvent}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function GroupHeader(
  props: DragProps & {
    group: ViewGroup;
    groupsListKey: string;
    isFirst: boolean;
    isLast: boolean;
    toggleGroup: (holderId: string) => void;
  },
) {
  const { group, groupsListKey, canDrag, moveRow, isFirst, isLast } = props;
  const drag = useRowDrag({ listKey: groupsListKey, id: group.holderId }, (dragged, position, id) =>
    moveRow(groupsListKey, dragged.id, dropToMove(position, id)),
  );
  const toggle = () => props.toggleGroup(group.holderId);
  return (
    <div
      className={`rel-group-header${drag.indicator ? ` drop-${drag.indicator}` : ''}`}
      tabIndex={0}
      aria-expanded={!group.collapsed}
      onClick={toggle}
      onKeyDown={(e) => activateOnKey(e, toggle)}
      onDragOver={canDrag ? drag.onDragOver : undefined}
      onDragLeave={canDrag ? drag.onDragLeave : undefined}
      onDrop={canDrag ? drag.onDrop : undefined}
      onContextMenu={
        canDrag
          ? (e) => openMoveMenu(e, moveRow, groupsListKey, group.holderId, isFirst, isLast)
          : undefined
      }
    >
      {canDrag && (
        <span
          className="rel-drag-handle"
          draggable
          onDragStart={drag.onDragStart}
          onDragEnd={drag.onDragEnd}
          onClick={(e) => e.stopPropagation()}
        >
          ⠿
        </span>
      )}
      <span className="rel-chevron" aria-hidden="true">
        {group.collapsed ? '▸' : '▾'}
      </span>
      <span className="rel-group-name">{group.label}</span>
      <span className="rel-group-count">standing with {group.rows.length}</span>
    </div>
  );
}

function EmptyState({ trackName }: { trackName: string }) {
  const [before, slash, after] = emptyStateParts(trackName);
  return (
    <div className="rel-empty">
      {before}
      <code>{slash}</code>
      {after}
    </div>
  );
}

export function PlaceholderTabBody(props: PlaceholderTabBodyProps) {
  const { groups, groupsListKey, canDrag, query, trackProblems } = props;
  const hasRows = groups.some((g) => g.rows.length > 0);
  const multiple = groups.length > 1;

  return (
    <div className="rel-placeholder-body">
      {!hasRows && query.trim() === '' && <EmptyState trackName={props.emptyStateTrackName} />}
      {!hasRows && query.trim() !== '' && (
        <div className="rel-empty">{props.emptyMessage ?? ''}</div>
      )}
      {groups.map((group, gi) => (
        <section key={group.holderId} className="rel-group">
          {multiple && groupsListKey && (
            <GroupHeader
              group={group}
              groupsListKey={groupsListKey}
              canDrag={canDrag}
              moveRow={props.moveRow}
              isFirst={gi === 0}
              isLast={gi === groups.length - 1}
              toggleGroup={props.toggleGroup}
            />
          )}
          {!group.collapsed &&
            group.rows.map((row, ri) => (
              <Row
                key={row.key}
                row={row}
                canDrag={canDrag}
                moveRow={props.moveRow}
                isFirst={ri === 0}
                isLast={ri === group.rows.length - 1}
                query={query}
                entityIndex={props.entityIndex}
                toggleRow={props.toggleRow}
                onOpenById={props.onOpenById}
                onOpenEvent={props.onOpenEvent}
              />
            ))}
        </section>
      ))}
      {trackProblems.length > 0 && (
        <div className="rel-problems">
          <h4 className="rel-problems-title">Problems in this track</h4>
          <ul>
            {trackProblems.map((p) => (
              <li key={`${p.path}#${p.ordinal ?? p.from}`}>
                {p.messages.join('; ')} <span className="rel-problem-file">{p.path}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
