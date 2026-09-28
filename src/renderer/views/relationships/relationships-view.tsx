import { FooterPortal } from '../../components/footer-portal';
import { FooterButton } from '../../components/footer-button';
import { useRelationships } from '../../relationships/hooks/use-relationships';
import { RelationshipsList } from '../../relationships/components/relationships-list';
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

export function RelationshipsView({
  campaignPath,
  entityLabelMap,
  getEntityIndex,
  onOpenById,
  onOpenEvent,
}: RelationshipsViewProps) {
  const library = useRelationshipLibraryContext();
  const state = useRelationships({ campaignPath, library, entityLabelMap, getEntityIndex });

  return (
    <div className="rel-view">
      <RelationshipsList state={state} onOpenById={onOpenById} onOpenEvent={onOpenEvent} />

      <FooterPortal slot="right">
        <FooterButton onClick={state.toggleMode} title="Toggle grouping">
          Group by {state.mode === 'holder' ? 'observer' : 'holder'}
        </FooterButton>
      </FooterPortal>
    </div>
  );
}
