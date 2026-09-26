/**
 * The matching rule behind the `@` link search (`suggestLinks`) — title/id
 * substring matching against the entity index. Shared with the relationship
 * bubble's note pickers (`NotePickerField` in
 * `markdown-editor/extensions/relationship-bubble.tsx`) so a note like "The
 * Whispering Claw" is found the same way in both places, instead of the
 * note pickers re-implementing their own search over `SearchablePicker`'s
 * file-path-aware `rankPickerOptions` (built for the New Note folder
 * picker, not for notes).
 */
import { rankMatch, compareRanked, type MatchRank } from './search/rank';

/**
 * Whether `query` matches `title` or `id`, case-insensitively, by
 * substring. This is the exact rule `suggestLinks` has always used — kept
 * as its own function so it (and the note pickers) can't drift apart.
 */
export function matchesEntityQuery(title: string, id: string, query: string): boolean {
  const q = query.toLowerCase();
  return title.toLowerCase().includes(q) || id.toLowerCase().includes(q);
}

/**
 * Ranks how well `query` matches `title`/`id` (prefix beats word-boundary
 * beats mid-word substring — see `rankMatch`), for callers that need to
 * order multiple matches rather than just filter them. `null` when there's
 * no match, or the query is empty/whitespace-only.
 */
export function rankEntityMatch(title: string, id: string, query: string): MatchRank | null {
  return rankMatch(title, query, [id]);
}

export { compareRanked };
export type { MatchRank };
