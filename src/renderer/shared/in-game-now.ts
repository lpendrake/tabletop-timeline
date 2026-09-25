/**
 * Derives the in-game "now" instant, in epoch-seconds, from a campaign's
 * timeline state. Shared by the timeline view (the scrubber's default
 * position) and the relationships view (which values are "current" vs
 * "only future"). Pure — no IO, no React.
 */

import type { Calendar } from '../../shared/calendar';

export interface InGameNowState {
  in_game_now_seconds?: number;
  /** Legacy string form, parsed as a fallback for older campaigns. */
  in_game_now?: string;
}

/** Unset (no now-line recorded, or an unparseable legacy string) resolves to `Infinity`. */
export function deriveInGameNowSeconds(
  state: InGameNowState | null | undefined,
  calendar: Calendar,
): number {
  if (state?.in_game_now_seconds != null) {
    return state.in_game_now_seconds;
  }
  const legacyStr = state?.in_game_now;
  if (!legacyStr) return Infinity;
  const parsed = calendar.tryParse(legacyStr);
  return parsed ? calendar.toEpochSeconds(parsed) : Infinity;
}
