import { useMemo } from 'react';
import type { EntityIndexEntry } from '../../../../types/global';
import type { TagTrack } from '../../../../shared/relationships';
import type { TableRow } from '../../domain/categorical';
import { tagHistory } from '../../domain/categorical-history';
import { openDeclaringFile } from '../../domain/step-open-target';

export interface TagHistoryProps {
  row: TableRow;
  track: TagTrack;
  now: number;
  titleByPath: ReadonlyMap<string, string>;
  labelFor: (id: string) => string;
  entityIndex: readonly EntityIndexEntry[] | null;
  onOpenEvent: (filename: string) => void;
  onOpenById: (id: string) => void;
}

/** An open row's changes, newest first, inline below it: date, gained or lost, and a link to what declared it. */
export function TagHistory(props: TagHistoryProps) {
  const { row, track, now, titleByPath, labelFor, entityIndex, onOpenEvent, onOpenById } = props;
  const entries = useMemo(
    () => tagHistory(row.ledger, track, row.option, now, titleByPath, labelFor),
    [row, track, now, titleByPath, labelFor],
  );
  return (
    <div className="rel-cat-history">
      {entries.map((entry) => (
        <div key={entry.key} className="rel-cat-entry">
          <span className="rel-cat-entry-date">{entry.dateLabel}</span>
          <span className={`rel-cat-entry-change is-${entry.change}`}>{entry.change}</span>
          <button
            type="button"
            className="rel-cat-entry-link"
            title={entry.title ?? undefined}
            onClick={() =>
              openDeclaringFile(entry.declaredPath, entityIndex ?? [], {
                event: onOpenEvent,
                note: onOpenById,
              })
            }
          >
            {entry.linkLabel}
          </button>
          {entry.mirroredFrom && (
            <span className="rel-cat-entry-mirror">
              (mirrored from {entry.mirroredFrom}&apos;s side)
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
