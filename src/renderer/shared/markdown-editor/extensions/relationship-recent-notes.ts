/**
 * Shared MRU (most-recently-chosen) store for the relationship bubble's
 * holder/observer note pickers. Deliberately ONE list: used by every
 * directive type (PF2E Reputation, Attitude, tags, …), every editor (the
 * note editor, the event editor), and every mounted bubble instance — never
 * per-component state, so switching views (which unmounts and remounts the
 * editor) never resets it. See the root `CLAUDE.md`'s "no business logic
 * inside hooks/components": this is a plain, non-React, non-CodeMirror
 * module — `relationship-bubble-view-plugin.ts` is the only thing that
 * reads and writes it.
 *
 * Persisted to `localStorage` (best-effort only — every access is wrapped
 * in try/catch, since a private window, cleared/blocked site data, or a
 * preview context can throw or silently no-op) so the list also survives a
 * full app reload. Also held in memory, so it keeps working for the rest of
 * the session even when `localStorage` throws or isn't available.
 *
 * Not campaign-scoped: no campaign identifier reaches the bubble today (see
 * `relationship-bubble-view-plugin.ts`'s `RelationshipBubbleHostContext` —
 * neither host wires one through `editor-host-config.ts` /
 * `use-relationship-editor-config.ts`), so this keeps one list per app
 * session rather than partitioning by campaign.
 */

const STORAGE_KEY = 'relationship-bubble:recent-note-ids';

/** How many recently-chosen notes to remember. */
export const RECENT_NOTES_LIMIT = 8;

/**
 * Pure MRU update: `id` moves to (or is inserted at) the front, with any
 * earlier occurrence removed, capped to `limit` entries. No IO — safe to
 * unit test directly.
 */
export function pushRecentNote(
  recents: readonly string[],
  id: string,
  limit: number = RECENT_NOTES_LIMIT,
): string[] {
  return [id, ...recents.filter((existing) => existing !== id)].slice(0, limit);
}

function readStorage(): string[] {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeStorage(ids: readonly string[]): void {
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Best-effort only — a private window, blocked site data, or a quota
    // error must never break picking a note.
  }
}

let recentNoteIds: string[] = readStorage();

/** The shared recents list, most-recently-chosen first. */
export function getRecentNoteIds(): readonly string[] {
  return recentNoteIds;
}

/**
 * Records `id` as the most recently chosen holder/observer note — shared by
 * every bubble instance, in every editor, for every directive type. No-op
 * for a falsy id (e.g. clearing a field, or a non-note role).
 */
export function rememberRecentNote(id: string | null | undefined): void {
  if (!id) return;
  recentNoteIds = pushRecentNote(recentNoteIds, id);
  writeStorage(recentNoteIds);
}

/** Test-only: resets the shared store (in-memory and persisted) to empty. */
export function resetRecentNoteIdsForTests(): void {
  recentNoteIds = [];
  try {
    window.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
