/**
 * The history of one holder–observer ledger and option: when the tag was
 * gained or lost, and the reason it links by. Pure — no IO, no React.
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
  /**
   * What the entry links by: the reason, else the declaring event's or note's title, else the file's name.
   * Unlike `historyEntryText` in search.ts, never blank: the tags table has no empty-reason display.
   */
  linkLabel: string;
  reason: string | null;
  /** The entity whose ledger this entry was mirrored from. */
  mirroredFrom: string | null;
}

/** Applied changes to `option` on this ledger, newest first; steps that leave it as it was (no-ops, a repeated mirror) are skipped. */
export function tagHistory(
  ledger: Ledger,
  track: TagTrack,
  option: string,
  now: number,
  titleByPath: ReadonlyMap<string, string>,
  labelFor: (id: string) => string,
): TagHistoryEntry[] {
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
    const reason = delta.reason?.trim() || null;
    chronological.push({
      key: historyKey(delta),
      at: delta.at,
      dateLabel: formatEntryDate(delta.at, { narrow: false }),
      change: nowHeld ? 'gained' : 'lost',
      title,
      declaredPath: delta.declaredIn.path,
      linkLabel: reason ?? title ?? basename(delta.declaredIn.path),
      reason,
      mirroredFrom: delta.mirrored ? labelFor(ledger.observer) : null,
    });
  }
  return chronological.reverse();
}

/** The reason of the latest change to `option` on this ledger; never blank (see `linkLabel`). */
export function latestReason(
  ledger: Ledger,
  track: TagTrack,
  option: string,
  now: number,
  titleByPath: ReadonlyMap<string, string>,
  labelFor: (id: string) => string,
): string {
  const [latest] = tagHistory(ledger, track, option, now, titleByPath, labelFor);
  // A held entry always has a gaining step, so the empty case cannot happen; '' keeps the type total.
  return latest?.linkLabel ?? '';
}
