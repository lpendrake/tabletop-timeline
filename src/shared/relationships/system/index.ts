import { TrackId, TrackSpec } from '../spec.js';
import { pf2eReputationSpec } from './pf2e-reputation.js';
import { attitudeSpec } from './attitude.js';
import { relationshipTagsSpec } from './relationship-tags.js';

export { pf2eReputationSpec, PF2E_REPUTATION_ID } from './pf2e-reputation.js';
export { attitudeSpec, ATTITUDE_ID } from './attitude.js';
export { relationshipTagsSpec, RELATIONSHIP_TAGS_ID } from './relationship-tags.js';

export const SYSTEM_TRACKS: TrackSpec[] = [pf2eReputationSpec, attitudeSpec, relationshipTagsSpec];

export const SYSTEM_TRACK_IDS: TrackId[] = SYSTEM_TRACKS.map((t) => t.id);

export function getSystemTrack(id: TrackId): TrackSpec | undefined {
  return SYSTEM_TRACKS.find((t) => t.id === id);
}
