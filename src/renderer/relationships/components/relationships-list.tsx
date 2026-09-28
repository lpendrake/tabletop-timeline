import type { UseRelationshipsResult } from '../hooks/use-relationships';
import { RelationshipsViewProvider } from '../relationships-context';
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
    <RelationshipsViewProvider value={{ state, onOpenById, onOpenEvent }}>
      <div className="rel-list">
        {state.rows.map((outer, index) => (
          <OuterRow
            key={outer.key}
            row={outer}
            isFirst={index === 0}
            isLast={index === state.rows.length - 1}
          />
        ))}
        <ProblemsList
          problems={state.problems}
          entityIndex={state.entityIndex}
          onOpenById={onOpenById}
          onOpenEvent={onOpenEvent}
        />
      </div>
    </RelationshipsViewProvider>
  );
}
