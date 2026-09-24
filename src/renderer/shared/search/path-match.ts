import { rankMatch, type MatchRank } from './rank';

/**
 * Ranks how well a slash-delimited `path` (e.g. a folder path like
 * `factions/the-house-of-storms/spies`) matches a slash-delimited `query`
 * (e.g. `storm/spies`).
 *
 * The query is split into segments on `/` (empty segments — such as a
 * trailing slash — are dropped). Each query segment must match some path
 * segment via {@link rankMatch}, and the matched path segments must occur
 * in strictly increasing order (gaps between them are fine, so a query can
 * skip over intermediate folders).
 *
 * Matching is greedy left-to-right for every segment except the last: each
 * earlier query segment claims the earliest path segment (after the
 * previous claim) that matches it at all, so later segments still have as
 * much of the path as possible to search. The LAST query segment instead
 * picks, among all still-available path segments, whichever gives the best
 * (lowest) rank — since that's the match the caller actually cares about
 * showing. When two candidates tie, the later (deeper) path segment wins,
 * simply because it's the one found last while scanning forward.
 *
 * Returns `null` when the query is empty or any segment fails to match.
 */
export function matchPath(path: string, query: string): MatchRank | null {
  const queryParts = query.split('/').filter((part) => part.length > 0);
  if (queryParts.length === 0) return null;

  const pathParts = path.split('/');

  let claimedUpTo = -1;
  for (let i = 0; i < queryParts.length - 1; i++) {
    const found = findFirstMatch(pathParts, queryParts[i], claimedUpTo + 1);
    if (found === null) return null;
    claimedUpTo = found;
  }

  const lastQueryPart = queryParts[queryParts.length - 1];
  let best: MatchRank | null = null;
  for (let idx = claimedUpTo + 1; idx < pathParts.length; idx++) {
    const rank = rankMatch(pathParts[idx], lastQueryPart);
    if (rank !== null && (best === null || rank <= best)) {
      best = rank;
    }
  }
  return best;
}

/** Finds the earliest path segment index (from `startIndex`) matching `query`. */
function findFirstMatch(
  pathParts: readonly string[],
  query: string,
  startIndex: number,
): number | null {
  for (let idx = startIndex; idx < pathParts.length; idx++) {
    if (rankMatch(pathParts[idx], query) !== null) return idx;
  }
  return null;
}
