import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { InvalidDirectiveEntry, NumericTrack } from '../../../../shared/relationships';
import type { EntityIndexEntry } from '../../../../types/global';
import {
  columnTemplate,
  type ColumnWidths,
  type NumericColumn,
} from '../../domain/numeric-columns';
import { numericTabModel } from '../../domain/numeric-rows';
import { percent, type PlotScale } from '../../domain/plot-scale';
import type { RowSort, SortColumn } from '../../domain/sort';
import type { MoveRow } from '../../domain/view-order';
import type { ViewGroup } from '../../domain/view-rows';
import { cssVars } from '../../../shared/css-vars';
import { GroupHeader } from '../group-header';
import { TabNotice, TrackProblems } from '../tab-notices';
import { NumericColumnHeader } from './numeric-column-header';
import { NumericRow } from './numeric-row';
import './numeric-tab.css';

export interface NumericTabProps {
  track: NumericTrack;
  /** The tab's toolbar, shown at the top of the sticky header. */
  toolbar: ReactNode;
  groups: ViewGroup[];
  groupsListKey: string | null;
  grouped: boolean;
  canDrag: boolean;
  query: string;
  now: number;
  entityIndex: EntityIndexEntry[] | null;
  emptyMessage: string | null;
  asOfLabel: string | null;
  trackProblems: InvalidDirectiveEntry[];
  widths: ColumnWidths;
  setColumnWidth: (column: NumericColumn, width: number) => void;
  resetColumnWidth: (column: NumericColumn) => void;
  sortMode: RowSort;
  sortByColumn: (column: SortColumn) => void;
  toggleRow: (listKey: string, observerId: string) => void;
  toggleGroup: (holderId: string) => void;
  moveRow: MoveRow;
  onOpenById: (id: string) => void;
  onOpenEvent: (filename: string) => void;
}

/** Band names centred over their spans, or numeric ticks when the track has no bands; inset like the rows' plots so labels line up with them. */
function AxisLabels({ scale }: { scale: PlotScale }) {
  return (
    <div className="rel-num-axis">
      <div className="rel-num-layer">
        {scale.bands.map((span) => (
          <span
            key={span.key}
            className="rel-num-axis-band"
            style={{
              left: percent(span.start),
              width: percent(span.end - span.start),
              ...cssVars({ '--rel-num-colour': span.colour }),
            }}
            title={span.label}
          >
            {span.label}
          </span>
        ))}
        {scale.ticks.map((tick) => (
          <span
            key={tick.value}
            className={`rel-num-axis-tick is-${tick.align}`}
            style={{ left: percent(tick.fraction) }}
          >
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function NumericTab(props: NumericTabProps) {
  const { track, groups, groupsListKey, grouped, canDrag, query, asOfLabel } = props;
  const { scale, rows } = useMemo(
    () => numericTabModel(track, groups, asOfLabel),
    [track, groups, asOfLabel],
  );
  return (
    <div
      className="rel-num-tab"
      style={cssVars({ '--rel-num-template': columnTemplate(props.widths, scale.hasBands) })}
    >
      <div className="rel-num-header">
        {props.toolbar}
        <div className="rel-num-columns">
          <NumericColumnHeader
            hasBands={scale.hasBands}
            widths={props.widths}
            sortMode={props.sortMode}
            sortByColumn={props.sortByColumn}
            setColumnWidth={props.setColumnWidth}
            resetColumnWidth={props.resetColumnWidth}
          />
          <AxisLabels scale={scale} />
        </div>
      </div>
      <TabNotice
        groups={groups}
        query={query}
        emptyMessage={props.emptyMessage}
        trackName={track.name}
      />
      {groups.map((group, gi) => (
        <section key={group.holderId} className="rel-group">
          {grouped && groupsListKey && (
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
              <NumericRow
                key={row.key}
                row={row}
                track={track}
                model={rows.get(row.key)!}
                scale={scale}
                canDrag={canDrag}
                striped={ri % 2 === 1}
                isFirst={ri === 0}
                isLast={ri === group.rows.length - 1}
                moveRow={props.moveRow}
                toggleRow={props.toggleRow}
                now={props.now}
                query={query}
                entityIndex={props.entityIndex}
                onOpenById={props.onOpenById}
                onOpenEvent={props.onOpenEvent}
              />
            ))}
        </section>
      ))}
      <TrackProblems problems={props.trackProblems} />
    </div>
  );
}
