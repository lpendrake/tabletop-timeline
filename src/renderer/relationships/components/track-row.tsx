import { describeTrackRow, valueDisplay } from '../domain';
import type { TrackRow as TrackRowModel } from '../domain';
import { useRelationshipsViewContext } from '../relationships-context';
import { TrackValue } from './track-value';
import { StepList } from './step-list';

export interface TrackRowProps {
  row: TrackRowModel;
}

export function TrackRow({ row }: TrackRowProps) {
  const { state } = useRelationshipsViewContext();
  const trackState = describeTrackRow(row, state.now);

  if (trackState.unknownTrack) {
    return (
      <div className="rel-track-row">
        <span className="rel-track-name">{row.trackId}</span>
        <span className="rel-track-error">Unknown track</span>
      </div>
    );
  }

  const track = row.track!;
  const display = trackState.value !== null ? valueDisplay(track, trackState.value) : null;
  const hasHistory = row.ledger.deltas.length > 0;
  const expanded = state.isTrackExpanded(row);

  return (
    <div className={`rel-track-row${trackState.onlyFuture ? ' rel-track-only-future' : ''}`}>
      <button
        type="button"
        className="rel-expand-toggle"
        onClick={() => state.toggleTrack(row)}
        disabled={!hasHistory}
        aria-expanded={expanded}
      >
        {hasHistory ? (expanded ? '▾' : '▸') : '·'}
      </button>
      <span className="rel-track-name">{track.name}</span>
      {display && <TrackValue display={display} />}
      {expanded && hasHistory && <StepList row={row} />}
    </div>
  );
}
