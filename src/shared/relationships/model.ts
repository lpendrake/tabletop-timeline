/**
 * Model types for relationship values, deltas and ledgers. Plain data only.
 */

import { EntityId, TrackId } from './spec.js';

/** A track's current value: a number (numeric), a rung key (ordinal), or option keys (categorical). */
export type TrackValue = number | string | string[];

export type DeltaOp =
  | { op: 'adjust'; by: number }
  | { op: 'set'; value: TrackValue }
  | { op: 'add'; key: string }
  | { op: 'remove'; key: string };

export type RelationshipDelta = DeltaOp & {
  /** Epoch-seconds the delta takes effect at; null = undated (declared directly on a note, not an event). */
  at: number | null;
  declaredIn: { path: string; ordinal: number };
  /** True when this delta was derived from a `mutual` categorical option on the paired ledger. */
  mirrored?: boolean;
  reason?: string;
};

export interface Ledger {
  holder: EntityId;
  observer: EntityId;
  track: TrackId;
  deltas: RelationshipDelta[];
}
