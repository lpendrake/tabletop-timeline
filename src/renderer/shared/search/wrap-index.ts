/**
 * Steps `index` by `delta`, wrapping around a list of `count` items. Shared
 * by every "move a highlight/target by one, wrapping at the ends" spot
 * (context menu keyboard nav, the searchable picker) so the modular
 * arithmetic lives in exactly one place.
 *
 * Returns `-1` when `count <= 0` (nothing to wrap around).
 */
export function wrapIndex(index: number, delta: number, count: number): number {
  if (count <= 0) return -1;
  return (((index + delta) % count) + count) % count;
}
