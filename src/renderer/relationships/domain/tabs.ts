/**
 * Tabs for the by-track Relationships view: one per track. Pure — no IO, no React.
 */
import type { Ledger } from '../../../shared/relationships/model';
import type { TrackKind } from '../../../shared/relationships/spec';
import { listTracks, type TrackLibrary } from '../../../shared/relationships/registry';
import { tokenise } from './search';
import type { ViewGroup } from './view-rows';

export interface TrackTab {
  trackId: string;
  name: string;
  kind: TrackKind;
  /** Number of relationships (ledgers) on the track. */
  count: number;
}

/** Structural subset of `InvalidDirectiveEntry`; `trackId` is optional. */
export interface InvalidEntryLike {
  trackId?: string;
}

/**
 * One tab per track in `listTracks` order. A disabled track keeps its tab only
 * when a ledger or invalid entry references it. Invalid entries naming an
 * unknown track create no tab (they only feed the problems badge).
 */
export function buildTabs(input: {
  library: TrackLibrary;
  disabledTrackIds?: Iterable<string>;
  ledgers: readonly Ledger[];
  invalid: readonly InvalidEntryLike[];
}): TrackTab[] {
  const disabled = new Set(input.disabledTrackIds ?? []);
  const counts = new Map<string, number>();
  for (const l of input.ledgers) counts.set(l.track, (counts.get(l.track) ?? 0) + 1);
  const invalidTracks = new Set<string>();
  for (const e of input.invalid) if (e.trackId) invalidTracks.add(e.trackId);

  const tabs: TrackTab[] = [];
  for (const track of listTracks(input.library)) {
    const count = counts.get(track.id) ?? 0;
    if (disabled.has(track.id) && count === 0 && !invalidTracks.has(track.id)) continue;
    tabs.push({ trackId: track.id, name: track.name, kind: track.kind, count });
  }
  return tabs;
}

/** Secondary tab text, e.g. `"numeric · 33"`. */
export function tabMeta(tab: TrackTab): string {
  return `${tab.kind} · ${tab.count}`;
}

/**
 * Empty-state copy as parts so the UI can render the slash as code:
 * `No X changes yet. Type ` + `/` + ` in an event or note and choose Relationships › X.`
 */
export function emptyStateParts(trackName: string): [string, string, string] {
  return [
    `No ${trackName} changes yet. Type `,
    '/',
    ` in an event or note and choose Relationships › ${trackName}.`,
  ];
}

/** The empty-state sentence as plain text. */
export function emptyStateText(trackName: string): string {
  return emptyStateParts(trackName).join('');
}

export type TabBodyNotice = { kind: 'empty-track' } | { kind: 'no-match'; message: string } | null;

/**
 * What a tab body shows in place of rows: nothing when there are rows, else the
 * empty-track hint when nothing is searched, else the no-match message.
 */
export function bodyNotice(
  hasRows: boolean,
  query: string,
  emptyMessage: string | null,
): TabBodyNotice {
  if (hasRows) return null;
  if (tokenise(query).length === 0) return { kind: 'empty-track' };
  return { kind: 'no-match', message: emptyMessage ?? '' };
}

/** `bodyNotice` for a tab whose rows live in groups: it has rows when any group does. */
export function tabBodyNotice(
  groups: readonly ViewGroup[],
  query: string,
  emptyMessage: string | null,
): TabBodyNotice {
  return bodyNotice(
    groups.some((g) => g.rows.length > 0),
    query,
    emptyMessage,
  );
}

/** The saved tab if still present, else the first tab, else null. */
export function resolveActiveTab(
  tabs: readonly TrackTab[],
  savedTrackId: string | null | undefined,
): string | null {
  if (savedTrackId && tabs.some((t) => t.trackId === savedTrackId)) return savedTrackId;
  return tabs[0]?.trackId ?? null;
}

/**
 * Problems-badge count. Drafts (unfinished directives) are never reported by
 * the index, so every entry is a genuine problem.
 */
export function problemCount(invalid: readonly unknown[]): number {
  return invalid.length;
}

/**
 * Index of the tab to move to for a tablist key: Left/Right wrap around,
 * Home/End jump to the ends. Returns null for any other key or an empty list.
 */
export function nextTabIndex(current: number, count: number, key: string): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowRight':
      return (current + 1) % count;
    case 'ArrowLeft':
      return (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/** Problems-badge text: `"1 problem"` / `"3 problems"`. */
export function problemsLabel(count: number): string {
  return `${count} ${count === 1 ? 'problem' : 'problems'}`;
}
