import { useRelationships } from '../../relationships/hooks/use-relationships';
import { useRelationshipLibraryContext } from '../../relationships/library-context';
import type { EntityIndexEntry } from '../../../types/global';
import '../../relationships/components/relationships.css';

export interface RelationshipsViewProps {
  campaignPath: string;
  entityLabelMap: Map<string, string>;
  getEntityIndex: () => EntityIndexEntry[];
  onOpenById: (id: string) => void;
  onOpenEvent: (filename: string) => void;
}

// Temporary: replaced by the #274 shell components in the next commit.
export function RelationshipsView({
  campaignPath,
  entityLabelMap,
  getEntityIndex,
}: RelationshipsViewProps) {
  const library = useRelationshipLibraryContext();
  const state = useRelationships({ campaignPath, library, entityLabelMap, getEntityIndex });

  return (
    <div className="rel-view">
      <div role="tablist">
        {state.tabs.map((tab) => (
          <button
            key={tab.trackId}
            type="button"
            role="tab"
            aria-selected={tab.trackId === state.activeTrackId}
            onClick={() => state.selectTab(tab.trackId)}
          >
            {tab.name}
          </button>
        ))}
      </div>
      {state.groups.map((group) => (
        <div key={group.listKey}>
          {state.groups.length > 1 && <div>{group.label}</div>}
          <ul>
            {group.rows.map((row) => (
              <li key={row.key}>{row.label}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
