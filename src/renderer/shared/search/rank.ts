/**
 * Pure text ranking for searchable lists (context menu items, folder picker
 * entries, etc). No fuzzy matching — a candidate either matches (with a
 * rank telling how good the match is) or it doesn't.
 */

/** 0 = prefix match, 1 = word-prefix match, 2 = substring match. */
export type MatchRank = 0 | 1 | 2;

/** Characters that count as a word boundary just before a match. */
function isWordBoundary(char: string): boolean {
  return !/[a-z0-9]/i.test(char);
}

/**
 * Ranks how well `text` matches `query`, optionally also checking a list of
 * `keywords` and returning the best (lowest) rank found across all of them.
 *
 * The query is trimmed and compared case-insensitively. An empty (or
 * whitespace-only) query returns `null` — callers should treat that as
 * "no search is active" rather than "everything matches".
 */
export function rankMatch(
  text: string,
  query: string,
  keywords?: readonly string[],
): MatchRank | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  let best: MatchRank | null = null;
  const candidates = keywords ? [text, ...keywords] : [text];
  for (const candidate of candidates) {
    const rank = rankOne(candidate.toLowerCase(), q);
    if (rank !== null && (best === null || rank < best)) {
      best = rank;
    }
    if (best === 0) break;
  }
  return best;
}

function rankOne(lowerText: string, lowerQuery: string): MatchRank | null {
  if (lowerText.startsWith(lowerQuery)) return 0;

  const index = lowerText.indexOf(lowerQuery);
  if (index === -1) return null;
  if (isWordBoundary(lowerText[index - 1])) return 1;
  return 2;
}

/**
 * Sorts ranked candidates by rank (lower is better), keeping the original
 * input order for ties.
 */
export function compareRanked<T extends { rank: MatchRank; index: number }>(a: T, b: T): number {
  return a.rank - b.rank || a.index - b.index;
}
