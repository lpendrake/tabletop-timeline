import type { InvalidDirectiveEntry } from '../../../shared/relationships';
import type { EntityIndexEntry } from '../../../types/global';
import { resolveStepOpenTarget } from '../domain';

export interface ProblemsListProps {
  problems: InvalidDirectiveEntry[];
  entityIndex: EntityIndexEntry[];
  onOpenById: (id: string) => void;
  onOpenEvent: (filename: string) => void;
}

export function ProblemsList({
  problems,
  entityIndex,
  onOpenById,
  onOpenEvent,
}: ProblemsListProps) {
  if (problems.length === 0) return null;

  return (
    <div className="rel-problems">
      <h3 className="rel-problems-title">Problems</h3>
      <ul className="rel-problems-list">
        {problems.map((problem, i) => {
          const target = resolveStepOpenTarget(problem.path, entityIndex);
          return (
            <li key={`${problem.path}#${problem.ordinal ?? i}`} className="rel-problem">
              <span className="rel-problem-path">{problem.path}</span>
              <span className="rel-problem-messages">{problem.messages.join('; ')}</span>
              {target.kind === 'event' && (
                <button
                  type="button"
                  className="rel-step-link"
                  onClick={() => onOpenEvent(target.filename)}
                >
                  Open event
                </button>
              )}
              {target.kind === 'note' && (
                <button
                  type="button"
                  className="rel-step-link"
                  onClick={() => onOpenById(target.entityId)}
                >
                  Open note
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
