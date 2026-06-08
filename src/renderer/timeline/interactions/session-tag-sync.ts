import type { EventListItem, Session } from '../data/types';
import { CalendarProvider } from '../calendar/provider';
import { sessionTagsForSeconds } from '../render/session-bands';
import { isSessionTag } from '../../../shared/entity-tags';

function eventSeconds(e: { epochSeconds?: number; date?: string }): number {
  if (typeof e.epochSeconds === 'number') return e.epochSeconds;
  const cal = CalendarProvider.get();
  const d = e.date ? cal.tryParse(e.date) : null;
  if (!d) throw new Error(`unparseable event date: ${e.date}`);
  return cal.toEpochSeconds(d);
}

export function seshTagsMatch(
  existingTags: readonly string[] | undefined,
  computed: readonly string[],
): boolean {
  const existing = (existingTags ?? []).filter((t) => isSessionTag(t));
  return existing.length === computed.length && computed.every((t) => existing.includes(t));
}

export function mergeSeshTags(
  existingTags: readonly string[] | undefined,
  computed: readonly string[],
): string[] {
  const nonSesh = (existingTags ?? []).filter((t) => !isSessionTag(t));
  return [...nonSesh, ...computed];
}

export function computeEventsNeedingSeshTagUpdate(
  events: readonly EventListItem[],
  sessions: readonly Session[],
): string[] {
  const toUpdate: string[] = [];
  for (const ev of events) {
    let secs: number;
    try {
      secs = eventSeconds(ev);
    } catch {
      continue;
    }
    const computed = sessionTagsForSeconds(secs, sessions as Session[]);
    const existing = (ev.tags ?? []).filter((t) => isSessionTag(t));
    if (seshTagsMatch(ev.tags, computed)) continue;
    if (computed.length > 0 || existing.length > 0) toUpdate.push(ev.filename);
  }
  return toUpdate;
}
