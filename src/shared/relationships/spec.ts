/**
 * Authoring types for relationship tracks. Plain data only — no behaviour lives here.
 * See `resolve.ts` for the compiled, consumer-facing `ResolvedTrack`.
 */

export type TrackId = string; // 4-char reserved id for system tracks, e.g. 'rp01'
export type EntityId = string; // 4-char entity id, [a-z0-9]{4}

/** A blank's role within an action template. */
export type Role = 'holder' | 'observer' | 'amount' | 'value' | 'option' | 'reason';

/** What kind of delta an action produces. */
export type ActionKind = 'adjust' | 'set' | 'add' | 'remove';

export interface ActionSpec {
  /** Immutable identity for this action within its track. */
  key: string;
  label: string;
  kind: ActionKind;
  /** Sentence template with `{role}` / `{role:Prompt}` blanks — see templates.ts. */
  template: string;
}

export interface BandSpec {
  /** Immutable identity for this band within its track. */
  key: string;
  label: string;
  /** Inclusive lower bound; bands are defined by ascending starts only. */
  start: number;
}

export interface NumericTrackSpec {
  kind: 'numeric';
  id: TrackId;
  name: string;
  actions: ActionSpec[];
  min: number | null;
  max: number | null;
  initial: number;
  step: number;
  bands?: BandSpec[];
  showValue: boolean;
}

export interface RungSpec {
  /** Immutable identity for this rung within its track. */
  key: string;
  label: string;
}

export interface OrdinalTrackSpec {
  kind: 'ordinal';
  id: TrackId;
  name: string;
  actions: ActionSpec[];
  rungs: RungSpec[];
  /** Rung key. */
  initial: string;
}

export interface OptionSpec {
  /** Immutable identity for this option within its track. */
  key: string;
  label: string;
  /** Whether adding this option to (holder, observer) also adds it to (observer, holder). */
  mutual: boolean;
}

export interface CategoricalTrackSpec {
  kind: 'categorical';
  id: TrackId;
  name: string;
  actions: ActionSpec[];
  options: OptionSpec[];
  multiple: boolean;
  extensible: boolean;
}

export type TrackSpec = NumericTrackSpec | OrdinalTrackSpec | CategoricalTrackSpec;
export type TrackKind = TrackSpec['kind'];
