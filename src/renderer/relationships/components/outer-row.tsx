import type {
  InnerRow as InnerRowModel,
  OuterRow as OuterRowModel,
  TrackRow as TrackRowModel,
} from '../domain';
import type { ValueCache } from '../domain';
import type { ParsedFileEntry } from '../hooks/use-relationships';
import type { EntityIndexEntry } from '../../../types/global';
import { EntityLink } from './entity-link';
import { InnerRow } from './inner-row';

export interface OuterRowProps {
  row: OuterRowModel;
  now: number;
  cache: ValueCache;
  labelFor: (id: string) => string;
  expanded: boolean;
  onToggle: () => void;
  isInnerExpanded: (row: InnerRowModel) => boolean;
  onToggleInner: (row: InnerRowModel) => void;
  isTrackExpanded: (row: TrackRowModel) => boolean;
  onToggleTrack: (row: TrackRowModel) => void;
  directivesFor: (path: string) => ParsedFileEntry | undefined;
  entityIndex: EntityIndexEntry[];
  onOpenById: (id: string) => void;
  onOpenEvent: (filename: string) => void;
}

export function OuterRow({
  row,
  now,
  cache,
  labelFor,
  expanded,
  onToggle,
  isInnerExpanded,
  onToggleInner,
  isTrackExpanded,
  onToggleTrack,
  directivesFor,
  entityIndex,
  onOpenById,
  onOpenEvent,
}: OuterRowProps) {
  return (
    <div className="rel-outer-row">
      <div className="rel-outer-header">
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
          className="rel-outer-label"
        />
      </div>
      {expanded && (
        <div className="rel-inner-list">
          {row.children.map((inner) => (
            <InnerRow
              key={inner.key}
              row={inner}
              now={now}
              cache={cache}
              labelFor={labelFor}
              expanded={isInnerExpanded(inner)}
              onToggle={() => onToggleInner(inner)}
              isTrackExpanded={isTrackExpanded}
              onToggleTrack={onToggleTrack}
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
