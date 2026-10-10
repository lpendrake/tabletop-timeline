/**
 * The tag-history popover for one holder–observer ledger and option: when the
 * tag was gained or lost, and whether it is held now. Pure — no IO, no React.
 */
import { basename } from '../../../shared/path';
import type { Ledger, TagTrack } from '../../../shared/relationships';
import { currentValue } from '../../../shared/relationships';
import { formatEntryDate } from './entry-date';
import { historyKey } from './view-rows';

export type TagChange = 'gained' | 'lost';

export interface TagHistoryEntry {
  key: string;
  at: number | null;
  dateLabel: string;
  change: TagChange;
  /** Title of the declaring event or note. */
  title: string | null;
  declaredPath: string;
  /** What the entry links by: the title, or the declaring file's name when it has none. */
  linkLabel: string;
  reason: string | null;
  /** The entity whose ledger this entry was mirrored from. */
  mirroredFrom: string | null;
}

export type TagStatus =
  | { kind: 'held'; since: number | null; changes: number }
  | { kind: 'not-held' };

export interface TagHistory {
  status: TagStatus;
  statusText: string;
  /** Newest first. */
  entries: TagHistoryEntry[];
}

export function tagStatusText(status: TagStatus): string {
  if (status.kind === 'not-held') return 'Not currently held';
  const since = status.since === null ? 'baseline (undated note)' : formatEntryDate(status.since);
  return `Held since ${since}${status.changes > 1 ? ` · ${status.changes} changes` : ''}`;
}

/** Applied changes to `option` on this ledger; steps that leave it as it was (no-ops, a repeated mirror) are skipped. */
export function tagHistory(
  ledger: Ledger,
  track: TagTrack,
  option: string,
  now: number,
  titleByPath: ReadonlyMap<string, string>,
  labelFor: (id: string) => string,
): TagHistory {
  const { steps } = currentValue(ledger, track, now, { withSteps: true });
  const chronological: TagHistoryEntry[] = [];
  let held = false;
  for (const step of steps) {
    if (!step.applied) continue;
    const nowHeld = Array.isArray(step.runningValue) && step.runningValue.includes(option);
    if (nowHeld === held) continue;
    held = nowHeld;
    const { delta } = step;
    const title = titleByPath.get(delta.declaredIn.path) ?? null;
    chronological.push({
      key: historyKey(delta),
      at: delta.at,
      dateLabel: formatEntryDate(delta.at, { narrow: false }),
      change: nowHeld ? 'gained' : 'lost',
      title,
      declaredPath: delta.declaredIn.path,
      linkLabel: title ?? basename(delta.declaredIn.path),
      reason: delta.reason?.trim() || null,
      mirroredFrom: delta.mirrored ? labelFor(ledger.observer) : null,
    });
  }
  const latest = chronological[chronological.length - 1];
  const status: TagStatus =
    latest?.change === 'gained'
      ? { kind: 'held', since: latest.at, changes: chronological.length }
      : { kind: 'not-held' };
  return { status, statusText: tagStatusText(status), entries: chronological.reverse() };
}
