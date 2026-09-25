import type { UseRelationshipsResult } from '../hooks/use-relationships';
import { OuterRow } from './outer-row';
import { ProblemsList } from './problems-list';

export interface RelationshipsListProps {
  state: UseRelationshipsResult;
  onOpenById: (id: string) => void;
  onOpenEvent: (filename: string) => void;
}

export function RelationshipsList({ state, onOpenById, onOpenEvent }: RelationshipsListProps) {
  if (state.rows.length === 0 && state.problems.length === 0) {
    return <div className="rel-empty">No relationships yet.</div>;
  }

  return (
    <div className="rel-list">
      {state.rows.map((outer, index) => (
        <OuterRow
          key={outer.key}
          row={outer}
          mode={state.mode}
          isFirst={index === 0}
          isLast={index === state.rows.length - 1}
          now={state.now}
          cache={state.cache}
          labelFor={state.labelFor}
          expanded={state.isOuterExpanded(outer)}
          onToggle={() => state.toggleOuter(outer)}
          isInnerExpanded={(inner) => state.isInnerExpanded(outer, inner)}
          onToggleInner={(inner) => state.toggleInner(outer, inner)}
          isTrackExpanded={state.isTrackExpanded}
          onToggleTrack={state.toggleTrack}
          directivesFor={state.directivesFor}
          entityIndex={state.entityIndex}
          onOpenById={onOpenById}
          onOpenEvent={onOpenEvent}
          onMoveToTop={state.moveRowToTop}
          onMoveUp={state.moveRowUp}
          onMoveDown={state.moveRowDown}
          onDrop={(dragged, position, targetId) =>
            position === 'before'
              ? state.moveRowBefore(dragged, targetId)
              : state.moveRowAfter(dragged, targetId)
          }
        />
      ))}
      <ProblemsList
        problems={state.problems}
        entityIndex={state.entityIndex}
        onOpenById={onOpenById}
        onOpenEvent={onOpenEvent}
      />
    </div>
  );
}
