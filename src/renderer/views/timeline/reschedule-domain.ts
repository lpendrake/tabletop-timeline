import type { Calendar } from '../../../shared/calendar';
import type { Event, EventFrontmatter } from '../../timeline/data/types';
import { isSessionTag } from '../../../shared/entity-tags';
import { sessionTagsForSeconds } from '../../timeline/render/session-bands';
import type { Session } from '../../timeline/data/types';

/**
 * Build the updated frontmatter for a rescheduled event.
 *
 * Dual-writes both `date` (human-readable ISO string) and `epochSeconds`
 * (exact integer) so the file is readable with any calendar and precise
 * for the active one.
 */
export function buildRescheduleFrontmatter(
  event: Event,
  newSeconds: number,
  sessions: Session[],
  cal: Calendar,
): EventFrontmatter {
  const newDate = cal.format(cal.fromEpochSeconds(newSeconds));
  const nonSeshTags = (event.tags ?? []).filter((t) => !isSessionTag(t));
  const newSeshTags = sessionTagsForSeconds(newSeconds, sessions);
  const updatedTags = [...nonSeshTags, ...newSeshTags];

  return {
    title: event.title,
    date: newDate,
    epochSeconds: newSeconds,
    ...(updatedTags.length > 0 ? { tags: updatedTags } : {}),
    ...(event.color ? { color: event.color } : {}),
    ...(event.status ? { status: event.status } : {}),
  };
}
