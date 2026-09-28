/** Pure helpers for the directives-by-path cache. No IO, no React. */

/** Returns a copy of `cache` with every key in `paths` removed. Returns `cache` unchanged (same reference) if none of `paths` were present. */
export function withoutPaths<T>(
  cache: Record<string, T>,
  paths: readonly string[],
): Record<string, T> {
  if (paths.length === 0) return cache;
  let changed = false;
  const next = { ...cache };
  for (const path of paths) {
    if (path in next) {
      delete next[path];
      changed = true;
    }
  }
  return changed ? next : cache;
}
