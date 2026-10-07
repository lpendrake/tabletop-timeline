import { NumericTab } from '../../relationships/components/numeric-tab/numeric-tab';
import { PlaceholderTabBody } from '../../relationships/components/placeholder-tab-body';
import { Toolbar } from '../../relationships/components/toolbar';
import { TopBar } from '../../relationships/components/top-bar';
import { useColumnWidths } from '../../relationships/hooks/use-column-widths';
import { useRelationships } from '../../relationships/hooks/use-relationships';
import { useRelationshipLibraryContext } from '../../relationships/library-context';
import type { EntityIndexEntry } from '../../../types/global';
import '../../relationships/components/relationships.css';
import '../../relationships/components/top-bar.css';
import '../../relationships/components/toolbar.css';
import '../../relationships/components/placeholder-tab-body.css';

export interface RelationshipsViewProps {
  campaignPath: string;
  entityLabelMap: Map<string, string>;
  getEntityIndex: () => EntityIndexEntry[];
  onOpenById: (id: string) => void;
  onOpenEvent: (filename: string) => void;
}

export function RelationshipsView({
  campaignPath,
  entityLabelMap,
  getEntityIndex,
  onOpenById,
  onOpenEvent,
}: RelationshipsViewProps) {
  const library = useRelationshipLibraryContext();
  const state = useRelationships({ campaignPath, library, entityLabelMap, getEntityIndex });
  const columnWidths = useColumnWidths(campaignPath);
  const { activeTrack } = state;

  return (
    <div className="rel-view">
      <TopBar
        tabs={state.tabs}
        activeTrackId={state.activeTrackId}
        onSelectTab={state.selectTab}
        asOfLabel={state.asOfLabel}
        problems={state.problems}
        entityIndex={state.entityIndex ?? []}
        onOpenById={onOpenById}
        onOpenEvent={onOpenEvent}
      />
      {activeTrack?.kind === 'numeric' ? (
        <NumericTab
          {...state}
          track={activeTrack}
          {...columnWidths}
          toolbar={<Toolbar {...state} />}
          onOpenById={onOpenById}
        />
      ) : activeTrack ? (
        <>
          <Toolbar {...state} />
          <PlaceholderTabBody
            {...state}
            track={activeTrack}
            emptyStateTrackName={activeTrack.name}
            onOpenById={onOpenById}
            onOpenEvent={onOpenEvent}
          />
        </>
      ) : (
        <div className="rel-empty">No relationship tracks are available.</div>
      )}
    </div>
  );
}
