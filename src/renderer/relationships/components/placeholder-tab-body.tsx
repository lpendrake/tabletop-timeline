// TEMPORARY placeholder layout for #274. It will be fully removed and replaced by the per-kind layouts in #275–#278; do not build on it.
import type { MouseEvent } from 'react';
import type { InvalidDirectiveEntry, ResolvedTrack } from '../../../shared/relationships';
import type { EntityIndexEntry } from '../../../types/global';
import {
  dropIndicatorClass,
  formatDeltaChange,
  formatLastChange,
  historyEntryClasses,
  trackValueLabeller,
  type ValueLabeller,
} from '../domain/row-display';
import { openDeclaringFile } from '../domain/step-open-target';
import type { MoveRow } from '../domain/view-order';
import type { HistoryEntry, ViewGroup, ViewRow } from '../domain/view-rows';
import { useRowReorder } from '../hooks/use-row-drag';
import { EntityLink } from './entity-link';
import { HighlightText } from './highlight-text';
import { GroupHeader } from './group-header';
import { activateOnKey, DragHandle, dropTargetProps, openRowMoveMenu } from './row-controls';
import { TabNotice, TrackProblems } from './tab-notices';
import './placeholder-tab-body.css';

export interface PlaceholderTabBodyProps {
  groups: ViewGroup[];
  groupsListKey: string | null;
  canDrag: boolean;
  query: string;
  emptyMessage: string | null;
  emptyStateTrackName: string;
  track: ResolvedTrack;
  trackProblems: InvalidDirectiveEntry[];
  toggleRow: (listKey: string, observerId: string) => void;
  toggleGroup: (holderId: string) => void;
  moveRow: MoveRow;
  onOpenById: (id: string) => void;
  onOpenEvent: (filename: string) => void;
  entityIndex: EntityIndexEntry[] | null;
}

interface DragProps {
  canDrag: boolean;
  moveRow: MoveRow;
}

function EntryItem(props: {
  entry: HistoryEntry;
  label: ValueLabeller;
  query: string;
  entityIndex: EntityIndexEntry[] | null;
  onOpenById: (id: string) => void;
  onOpenEvent: (filename: string) => void;
}) {
  const { entry, label, query, entityIndex, onOpenById, onOpenEvent } = props;
  const openTitle = (e: MouseEvent) => {
    e.stopPropagation();
    openDeclaringFile(entry.delta.declaredIn.path, entityIndex ?? [], {
      event: onOpenEvent,
      note: onOpenById,
    });
  };
  return (
    <li className={historyEntryClasses(entry)}>
      <span className="rel-entry-date">{entry.dateLabel}</span>
      <span className="rel-entry-change">
        {formatDeltaChange(entry.delta, label)} → {entry.runningFormatted}
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
    label: ValueLabeller;
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
  const drag = useRowReorder(row.listKey, row.observerId, moveRow);
  const toggle = () => props.toggleRow(row.listKey, row.observerId);
  return (
    <div
      className={`rel-row-wrap${dropIndicatorClass(drag.indicator)}`}
      {...dropTargetProps(drag, canDrag)}
    >
      <div
        className={`rel-row${row.onlyFuture ? ' is-future' : ''}`}
        tabIndex={0}
        aria-expanded={row.expanded}
        onClick={toggle}
        onKeyDown={(e) => activateOnKey(e, toggle)}
        onContextMenu={
          canDrag
            ? (e) => openRowMoveMenu(e, moveRow, row.listKey, row.observerId, isFirst, isLast)
            : undefined
        }
      >
        {canDrag && <DragHandle drag={drag} />}
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
          {row.lastChange ? formatLastChange(row.lastChange, props.label) : ''}
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
              label={props.label}
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

export function PlaceholderTabBody(props: PlaceholderTabBodyProps) {
  const { groups, groupsListKey, canDrag, query, trackProblems } = props;
  const multiple = groups.length > 1;
  const label = trackValueLabeller(props.track);

  return (
    <div className="rel-placeholder-body">
      <TabNotice
        groups={groups}
        query={query}
        emptyMessage={props.emptyMessage}
        trackName={props.emptyStateTrackName}
      />
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
                label={label}
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
      <TrackProblems problems={trackProblems} />
    </div>
  );
}
