/**
 * Plain data contracts shared between the main process and the renderer over
 * IPC. No behaviour, no IO — just the shapes both sides need to agree on.
 * The renderer must import these from here, never from `src/main/`.
 */

import { OptionSpec } from './spec.js';
import { TrackLibrary } from './registry.js';

export interface InvalidDirectiveEntry {
  path: string;
  /** Absent for a raw parse error, which isn't associated with a well-formed directive. */
  ordinal?: number;
  from: number;
  to: number;
  messages: string[];
}

export type LedgersAs = 'holder' | 'observer' | 'both';

export type AddOptionResult =
  | { ok: true; option: OptionSpec; library: TrackLibrary }
  | { ok: false; reason: 'unknown-track' | 'not-categorical' };
