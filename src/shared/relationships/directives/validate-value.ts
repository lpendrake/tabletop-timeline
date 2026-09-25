/**
 * The one place a directive's `amount`/`value` role text is turned into a
 * number and checked against its track: used by `interpret.ts` (resolving a
 * directive), `readable.ts` (formatting one for display) and the editor's
 * fill-in bubble. A fractional amount on an integer-step track, or garbage
 * like `1e3`/`0x10`, is rejected here rather than reaching `ResolvedTrack`.
 */

import { ResolvedTrack } from '../resolve.js';

/** Strict decimal syntax only — no exponents, no hex, no leading/trailing junk. */
export const STRICT_DECIMAL_RE = /^[+-]?\d+(\.\d+)?$/;

export type ValueValidation = { ok: true; value: number } | { ok: false; message: string };

function requiresInteger(track: ResolvedTrack): boolean {
  return track.kind === 'ordinal' || (track.kind === 'numeric' && Number.isInteger(track.step));
}

/**
 * Validates raw text for the `amount` (adjust) or `value` (numeric set) role
 * against a track: strict decimal syntax, non-zero for `amount`, an integer
 * when the track's steps are integral, and — for `value` — within range.
 */
export function validateRoleValue(
  role: 'amount' | 'value',
  raw: string,
  track: ResolvedTrack,
): ValueValidation {
  const trimmed = raw.trim();
  if (!STRICT_DECIMAL_RE.test(trimmed)) {
    return { ok: false, message: `"${raw}" is not a number` };
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n)) {
    return { ok: false, message: `"${raw}" is not a number` };
  }
  if (requiresInteger(track) && !Number.isInteger(n)) {
    return { ok: false, message: `${n} must be a whole number` };
  }
  if (role === 'amount') {
    if (n === 0) return { ok: false, message: 'Amount cannot be zero' };
    return { ok: true, value: n };
  }
  // role === 'value'
  if (!track.isValidValue(n)) {
    return { ok: false, message: `${n} is out of range for ${track.name}` };
  }
  return { ok: true, value: n };
}
