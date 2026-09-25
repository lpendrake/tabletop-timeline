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
  NumericTrack,
  OrdinalTrack,
  TagTrack,
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
export { resolveTrack, listTracks, withOptionAdditions, EMPTY_TRACK_LIBRARY } from './registry.js';

// Directives (parsing, serialisation, semantic resolution, readable sentences)
export type {
  RoleToken,
  DirectiveSegment,
  ParsedDirective,
  DirectiveParseError,
  DirectiveEdit,
  DirectiveProblemCode,
  DirectiveProblem,
  InterpretedDirective,
  InterpretContext,
  ReadablePart,
  ReadableContext,
  ValueValidation,
} from './directives/index.js';
export {
  parseDirectives,
  roleValue,
  isUnfinished,
  missingRoles,
  noteIdOf,
  noteRoleValue,
  serialiseDirective,
  serialiseTemplate,
  setRoleValueChange,
  sanitiseValue,
  interpretDirective,
  allowedActions,
  readableParts,
  promptFor,
  NOTE_DEFAULT_REASON,
  validateRoleValue,
  STRICT_DECIMAL_RE,
} from './directives/index.js';

// IPC contract types (shared shape between main and renderer)
export type { InvalidDirectiveEntry, LedgersAs, AddOptionResult } from './ipc-types.js';
