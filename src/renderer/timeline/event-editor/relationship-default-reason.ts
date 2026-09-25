import { effectiveTitle, type EditorBuffer } from './domain';
import { NOTE_DEFAULT_REASON } from '../../../shared/relationships';

/**
 * The default `reason` the relationship editor menu/bubble fill in for
 * directives inserted in the event editor: the event's current effective
 * title (its body H1, falling back to the title field), so it follows
 * renames as the user types — never a stale snapshot from when the event
 * was opened.
 */
export function eventRelationshipDefaultReason(buf: EditorBuffer): string {
  return effectiveTitle(buf) || NOTE_DEFAULT_REASON;
}
