/**
 * Holder / Toward picker logic for one track's tab. Pure — no IO, no React.
 */
import type { Ledger } from '../../../shared/relationships/model';
import type { TrackKind } from '../../../shared/relationships/spec';

/** Sentinel holder id meaning "all holders" / "anyone". */
export const ALL_HOLDERS = '*';

export interface HolderEntry {
  id: string;
  count: number;
}

/** Holders with relationships on the track, by count desc then label. */
export function holdersForTrack(
  ledgers: readonly Ledger[],
  trackId: string,
  labelFor: (id: string) => string,
): HolderEntry[] {
  const counts = new Map<string, number>();
  for (const l of ledgers) {
    if (l.track === trackId) counts.set(l.holder, (counts.get(l.holder) ?? 0) + 1);
  }
  const labels = new Map<string, string>();
  for (const id of counts.keys()) labels.set(id, labelFor(id));
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        (labels.get(a.id) as string).localeCompare(labels.get(b.id) as string) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

/** Picker caption: `Toward` for ordinal, `Holder` otherwise. */
export function pickerLabel(kind: TrackKind): string {
  return kind === 'ordinal' ? 'Toward' : 'Holder';
}

/** Label of the all-entry: `Anyone` for ordinal, `All holders` otherwise. */
export function allLabel(kind: TrackKind): string {
  return kind === 'ordinal' ? 'Anyone' : 'All holders';
}

/**
 * Pinned picker entries: the ALL sentinel (`'*'`, count = total), then the
 * default holder when it has relationships on the track. Labels are the
 * caller's job (`allLabel(kind)` for the sentinel, entity label otherwise).
 */
export function pinnedHolders(input: {
  kind: TrackKind;
  total: number;
  defaultHolderId: string | null | undefined;
  holders: readonly HolderEntry[];
}): HolderEntry[] {
  const pinned: HolderEntry[] = [{ id: ALL_HOLDERS, count: input.total }];
  const def = input.defaultHolderId
    ? input.holders.find((h) => h.id === input.defaultHolderId)
    : undefined;
  if (def) pinned.push({ id: def.id, count: def.count });
  return pinned;
}

/** The picker only shows when there is more than one holder to choose between. */
export function showHolderPicker(holders: readonly HolderEntry[]): boolean {
  return holders.length > 1;
}

/** Saved selection if valid (incl. `'*'`), else the default holder, else the first holder, else `'*'`. */
export function resolveSelectedHolder(
  saved: string | null | undefined,
  holders: readonly HolderEntry[],
  defaultHolderId: string | null | undefined,
): string {
  if (saved === ALL_HOLDERS) return ALL_HOLDERS;
  if (saved && holders.some((h) => h.id === saved)) return saved;
  if (defaultHolderId && holders.some((h) => h.id === defaultHolderId)) return defaultHolderId;
  return holders[0]?.id ?? ALL_HOLDERS;
}

/** Ledgers on the track for a holder; `'*'` = every holder. */
export function ledgersForHolder(
  ledgers: readonly Ledger[],
  trackId: string,
  holderId: string,
): Ledger[] {
  return ledgers.filter(
    (l) => l.track === trackId && (holderId === ALL_HOLDERS || l.holder === holderId),
  );
}
