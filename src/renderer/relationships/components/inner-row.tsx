import type { InnerRow as InnerRowModel, TrackRow as TrackRowModel } from '../domain';
import type { ValueCache } from '../domain';
import type { ParsedFileEntry } from '../hooks/use-relationships';
import type { EntityIndexEntry } from '../../../types/global';
import { EntityLink } from './entity-link';
import { TrackRow } from './track-row';

export interface InnerRowProps {
  row: InnerRowModel;
  now: number;
  cache: ValueCache;
  labelFor: (id: string) => string;
  expanded: boolean;
  onToggle: () => void;
  isTrackExpanded: (row: TrackRowModel) => boolean;
  onToggleTrack: (row: TrackRowModel) => void;
  directivesFor: (path: string) => ParsedFileEntry | undefined;
  entityIndex: EntityIndexEntry[];
  onOpenById: (id: string) => void;
  onOpenEvent: (filename: string) => void;
}

export function InnerRow({
  row,
  now,
  cache,
  labelFor,
  expanded,
  onToggle,
  isTrackExpanded,
  onToggleTrack,
  directivesFor,
  entityIndex,
  onOpenById,
  onOpenEvent,
}: InnerRowProps) {
  return (
    <div className="rel-inner-row">
      <div className="rel-inner-header">
        <button
          type="button"
          className="rel-expand-toggle"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <EntityLink
          id={row.entityId}
          label={labelFor(row.entityId)}
          onOpenById={onOpenById}
          className="rel-inner-label"
        />
      </div>
      {expanded && (
        <div className="rel-track-list">
          {row.tracks.map((track) => (
            <TrackRow
              key={track.key}
              row={track}
              now={now}
              cache={cache}
              labelFor={labelFor}
              expanded={isTrackExpanded(track)}
              onToggle={() => onToggleTrack(track)}
              directivesFor={directivesFor}
              entityIndex={entityIndex}
              onOpenById={onOpenById}
              onOpenEvent={onOpenEvent}
            />
          ))}
        </div>
      )}
    </div>
  );
}
