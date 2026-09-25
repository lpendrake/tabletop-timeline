// Authoring types
export type {
  TrackId,
  EntityId,
  Role,
  ActionKind,
  ActionSpec,
  BandSpec,
  NumericTrackSpec,
  RungSpec,
  OrdinalTrackSpec,
  OptionSpec,
  CategoricalTrackSpec,
  TrackSpec,
  TrackKind,
} from './spec.js';

// Model types
export type { TrackValue, DeltaOp, RelationshipDelta, Ledger } from './model.js';

// Templates
export type {
  Blank,
  TemplateError,
  TemplateErrorCode,
  TemplateValidationResult,
} from './templates.js';
export { ROLES, isRole, extractBlanks, requiredRoles, validateTemplate } from './templates.js';

// Resolve
export type {
  ResolvedAction,
  ResolvedTrack,
  NumericPosition,
  OrdinalPosition,
  SpecError,
  SpecValidationResult,
} from './resolve.js';
export { validateTrackSpec, compileTrack, resolveTrackSpec } from './resolve.js';

// Current value
export type { Step, CurrentValueResult, CurrentValueOptions } from './current-value.js';
export {
  compareDeltas,
  applyDelta,
  currentValue,
  computeValue,
  computeValueFromSorted,
} from './current-value.js';

// System tracks
export {
  SYSTEM_TRACKS,
  SYSTEM_TRACK_IDS,
  getSystemTrack,
  pf2eReputationSpec,
  PF2E_REPUTATION_ID,
  attitudeSpec,
  ATTITUDE_ID,
  relationshipTagsSpec,
  RELATIONSHIP_TAGS_ID,
} from './system/index.js';

// Registry
export type { TrackLibrary } from './registry.js';
export { resolveTrack, listTracks, withOptionAdditions } from './registry.js';
