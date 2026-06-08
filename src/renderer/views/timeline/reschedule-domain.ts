import type { Event, EventFrontmatter } from '../../timeline/data/types';
import { isSessionTag } from '../../../shared/entity-tags';
import { sessionTagsForSeconds } from '../../timeline/render/session-bands';
import type { Session } from '../../timeline/data/types';

/**
 * Build the updated frontmatter for a rescheduled event.
 *
 * Stores only `epochSeconds` (exact integer seconds since the campaign
 * calendar's epoch). The legacy `date` string is no longer written.
 */
export function buildRescheduleFrontmatter(
  event: Event,
  newSeconds: number,
  sessions: Session[],
): EventFrontmatter {
  const nonSeshTags = (event.tags ?? []).filter((t) => !isSessionTag(t));
  const newSeshTags = sessionTagsForSeconds(newSeconds, sessions);
  const updatedTags = [...nonSeshTags, ...newSeshTags];

  return {
    title: event.title,
    epochSeconds: newSeconds,
    ...(updatedTags.length > 0 ? { tags: updatedTags } : {}),
    ...(event.color ? { color: event.color } : {}),
    ...(event.status ? { status: event.status } : {}),
  };
}
