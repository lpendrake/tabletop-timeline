import type { TrackRow } from '../domain';
import { buildStepRows, buildStepSentence, resolveStepOpenTarget } from '../domain';
import { currentValue } from '../../../shared/relationships/current-value';
import { useRelationshipsViewContext } from '../relationships-context';

export interface StepListProps {
  row: TrackRow;
}

/** History for one expanded track row: only ever computed while that row is expanded. */
export function StepList({ row }: StepListProps) {
  const { state, onOpenById, onOpenEvent } = useRelationshipsViewContext();
  if (!row.track) return null;
  const track = row.track;
  const { steps: rawSteps } = currentValue(row.ledger, track, state.now, { withSteps: true });
  const steps = buildStepRows(rawSteps, track);

  return (
    <ul className="rel-step-list">
      {steps.map((step) => {
        const sentence = buildStepSentence(
          row.ledger,
          step,
          track,
          state.directivesFor(step.declaredIn.path),
          state.labelFor,
        );
        const target = resolveStepOpenTarget(step.declaredIn.path, state.entityIndex);
        const isFuture = !step.applied;

        return (
          <li
            key={step.key}
            className={[
              'rel-step',
              isFuture ? 'rel-step-future' : '',
              step.reset ? 'rel-step-set-break' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="rel-step-sentence">
              {sentence ? (
                sentence.parts.map((part, i) =>
                  part.kind === 'text' ? (
                    <span key={i}>{part.text}</span>
                  ) : (
                    <span key={i} className={part.problem ? 'rel-step-problem' : undefined}>
                      {part.display}
                    </span>
                  ),
                )
              ) : (
                <span className="rel-step-loading">Loading…</span>
              )}
              {sentence?.mirroredFromLabel && (
                <span className="rel-step-mirrored">
                  {' '}
                  (mirrored from {sentence.mirroredFromLabel}&rsquo;s side)
                </span>
              )}
            </span>
            <span className="rel-step-running">{step.formattedRunning}</span>
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
  );
}
