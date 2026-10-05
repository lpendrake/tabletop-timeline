import { useId, useRef, useState } from 'react';
import type { EntityIndexEntry } from '../../../types/global';
import type { InvalidDirectiveEntry } from '../../../shared/relationships/ipc-types';
import { problemsLabel } from '../domain/tabs';
import { resolveStepOpenTarget } from '../domain/step-open-target';
import { usePopoverDismiss } from '../hooks/use-popover-dismiss';
import './top-bar.css';

interface ProblemsBadgeProps {
  problems: readonly InvalidDirectiveEntry[];
  entityIndex: readonly EntityIndexEntry[];
  onOpenById: (entityId: string) => void;
  onOpenEvent: (filename: string) => void;
}

export function ProblemsBadge({
  problems,
  entityIndex,
  onOpenById,
  onOpenEvent,
}: ProblemsBadgeProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  usePopoverDismiss(open, () => setOpen(false), popoverRef, buttonRef);

  if (problems.length === 0) return null;

  return (
    <div className="rel-problems">
      <button
        ref={buttonRef}
        type="button"
        className="rel-problems-pill"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {problemsLabel(problems.length)}
      </button>
      {open && (
        <div
          ref={popoverRef}
          className="rel-problems-popover"
          role="dialog"
          aria-labelledby={labelId}
        >
          <div id={labelId} className="rel-problems-title">
            Relationship problems
          </div>
          <ul className="rel-problems-list">
            {problems.map((p, i) => {
              const target = resolveStepOpenTarget(p.path, entityIndex);
              const onOpen =
                target.kind === 'event'
                  ? () => onOpenEvent(target.filename)
                  : target.kind === 'note'
                    ? () => onOpenById(target.entityId)
                    : null;
              return (
                <li key={`${p.path}:${p.from}:${i}`} className="rel-problem">
                  {p.messages.map((m, j) => (
                    <div key={j} className="rel-problem-message">
                      {m}
                    </div>
                  ))}
                  <div className="rel-problem-file">
                    <span className="rel-problem-path">{p.path}</span>
                    {onOpen && (
                      <button
                        type="button"
                        className="rel-problem-open"
                        onClick={() => {
                          setOpen(false);
                          onOpen();
                        }}
                      >
                        Open
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
