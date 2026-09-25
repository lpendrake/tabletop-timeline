import { describeTrackRow, valueDisplay } from '../domain';
import type { TrackRow as TrackRowModel } from '../domain';
import type { ValueCache } from '../domain';
import type { ParsedFileEntry } from '../hooks/use-relationships';
import type { EntityIndexEntry } from '../../../types/global';
import { TrackValue } from './track-value';
import { StepList } from './step-list';

export interface TrackRowProps {
  row: TrackRowModel;
  now: number;
  cache: ValueCache;
  labelFor: (id: string) => string;
  expanded: boolean;
  onToggle: () => void;
  directivesFor: (path: string) => ParsedFileEntry | undefined;
  entityIndex: EntityIndexEntry[];
  onOpenById: (id: string) => void;
  onOpenEvent: (filename: string) => void;
}

export function TrackRow({
  row,
  now,
  cache,
  labelFor,
  expanded,
  onToggle,
  directivesFor,
  entityIndex,
  onOpenById,
  onOpenEvent,
}: TrackRowProps) {
  const state = describeTrackRow(row, now, cache);

  if (state.unknownTrack) {
    return (
      <div className="rel-track-row">
        <span className="rel-track-name">{row.trackId}</span>
        <span className="rel-track-error">Unknown track</span>
      </div>
    );
  }

  const track = row.track!;
  const display = state.value !== null ? valueDisplay(track, state.value) : null;
  const hasHistory = row.ledger.deltas.length > 0;

  return (
    <div className={`rel-track-row${state.onlyFuture ? ' rel-track-only-future' : ''}`}>
      <button
        type="button"
        className="rel-expand-toggle"
        onClick={onToggle}
        disabled={!hasHistory}
        aria-expanded={expanded}
      >
        {hasHistory ? (expanded ? '▾' : '▸') : '·'}
      </button>
      <span className="rel-track-name">{track.name}</span>
      {display && <TrackValue display={display} />}
      {expanded && hasHistory && (
        <StepList
          row={row}
          now={now}
          cache={cache}
          labelFor={labelFor}
          directivesFor={directivesFor}
          entityIndex={entityIndex}
          onOpenById={onOpenById}
          onOpenEvent={onOpenEvent}
        />
      )}
    </div>
  );
}
