import type { TrackRow } from '../domain';
import { buildStepRows, buildStepSentence, resolveStepOpenTarget } from '../domain';
import type { ParsedFileEntry } from '../hooks/use-relationships';
import type { ValueCache } from '../domain';
import type { EntityIndexEntry } from '../../../types/global';

export interface StepListProps {
  row: TrackRow;
  now: number;
  cache: ValueCache;
  labelFor: (id: string) => string;
  directivesFor: (path: string) => ParsedFileEntry | undefined;
  entityIndex: EntityIndexEntry[];
  onOpenById: (id: string) => void;
  onOpenEvent: (filename: string) => void;
}

/** History for one expanded track row: only ever computed while that row is expanded. */
export function StepList({
  row,
  now,
  cache,
  labelFor,
  directivesFor,
  entityIndex,
  onOpenById,
  onOpenEvent,
}: StepListProps) {
  if (!row.track) return null;
  const track = row.track;
  const steps = buildStepRows(cache.stepsOf(row.ledger, track, now), track);

  return (
    <ul className="rel-step-list">
      {steps.map((step) => {
        const sentence = buildStepSentence(
          row.ledger,
          step,
          track,
          directivesFor(step.declaredIn.path),
          labelFor,
        );
        const target = resolveStepOpenTarget(step.declaredIn.path, entityIndex);
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
