import { CalendarProvider } from '../calendar/provider';
import type { Event, EventFrontmatter } from '../data/types';
import { ThemeProvider } from '../../theme';
import { weekdayColor } from '../render/cards';
import type { WeekdayColors } from '../../theme/types';
import {
  extractWikiLinkIds,
  syncEntityTags,
  isSessionTag,
  isValidCustomTag,
  formatEntityTag,
  resolveEntityTagLabel,
} from '../../../shared/entity-tags';
import { extractH1 } from '../../../shared/frontmatter';

export interface EditorBuffer {
  title: string;
  date: string;
  tagsText: string;
  color: string;
  body: string;
  id?: string;
  tagLabelOverride: string;
  linkLabelOverride: string;
  systemTags: string[];
}

export type EditorMode =
  | { kind: 'create'; initialDate?: string }
  | { kind: 'edit'; filename: string; initialCursor?: number };

export type { ColorPreset } from '../../theme';

export function emptyBuffer(initialDate?: string): EditorBuffer {
  return {
    title: '',
    date: initialDate ?? '',
    tagsText: '',
    color: '',
    body: '',
    tagLabelOverride: '',
    linkLabelOverride: '',
    systemTags: [],
  };
}

function normalizeDateText(raw: string): string {
  const cal = CalendarProvider.get();
  const parsed = cal.tryParse(raw.trim());
  return parsed ? cal.format(parsed) : raw.trim();
}

export function bufferFromEvent(ev: Event): EditorBuffer {
  const cal = CalendarProvider.get();
  const dateText =
    ev.epochSeconds != null
      ? cal.format(cal.fromEpochSeconds(ev.epochSeconds))
      : normalizeDateText(ev.date);
  return {
    title: ev.title,
    date: dateText,
    tagsText: (ev.tags ?? []).filter(isValidCustomTag).join(', '),
    color: ev.color ?? '',
    body: ev.body,
    id: ev.id,
    tagLabelOverride: ev.tagLabelOverride ?? '',
    linkLabelOverride: ev.linkLabelOverride ?? '',
    systemTags: (ev.tags ?? []).filter(isSessionTag),
  };
}

export function parseTagsText(tagsText: string): string[] {
  return tagsText
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function hasReservedTagPrefix(tagsText: string): boolean {
  return parseTagsText(tagsText).some((t) => !isValidCustomTag(t));
}

export function addTagsToText(currentText: string, input: string): string {
  const existing = new Set(parseTagsText(currentText));
  const toAdd = parseTagsText(input)
    .filter(isValidCustomTag)
    .filter((t) => !existing.has(t));
  if (toAdd.length === 0) return currentText;
  return [...parseTagsText(currentText), ...toAdd].join(', ');
}

export function removeTagFromText(currentText: string, tag: string): string {
  return parseTagsText(currentText)
    .filter((t) => t !== tag)
    .join(', ');
}

/**
 * The title that drives display, links, and tags: the body's first H1 if
 * present, otherwise the buffer's title field. Trimmed. This is the single
 * source of truth the editor should show for the effective title — the H1
 * wins so the override placeholders and saved frontmatter stay in sync with
 * what the user actually typed in the body.
 */
export function effectiveTitle(buf: EditorBuffer): string {
  return (extractH1(buf.body) ?? buf.title).trim();
}

export function bufferToFrontmatter(buf: EditorBuffer): EventFrontmatter {
  const cal = CalendarProvider.get();
  const tags = parseTagsText(buf.tagsText).filter(isValidCustomTag);
  const linkedIds = extractWikiLinkIds(buf.body);
  const syncedTags = syncEntityTags(tags, linkedIds);
  const allTags = [...syncedTags, ...buf.systemTags];
  const fm: EventFrontmatter = {
    title: effectiveTitle(buf),
    date: buf.date.trim(),
  };
  const parsed = cal.tryParse(buf.date.trim());
  if (parsed) fm.epochSeconds = cal.toEpochSeconds(parsed);
  if (allTags.length > 0) fm.tags = allTags;
  if (buf.color) fm.color = buf.color;
  if (buf.id) fm.id = buf.id;
  if (buf.tagLabelOverride.trim()) fm.tagLabelOverride = buf.tagLabelOverride.trim();
  if (buf.linkLabelOverride.trim()) fm.linkLabelOverride = buf.linkLabelOverride.trim();
  return fm;
}

export function validateBuffer(buf: EditorBuffer): string | null {
  if (!effectiveTitle(buf)) return 'Title is required.';
  if (!buf.date.trim()) return 'Date is required.';
  const cal = CalendarProvider.get();
  const parsed = cal.tryParse(buf.date.trim());
  if (!parsed) return `Date is not valid for this calendar: "${buf.date.trim()}"`;
  return null;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function deriveFilenameDatePart(date: string): string {
  const cal = CalendarProvider.get();
  const parsed = cal.tryParse(date.trim());
  if (parsed) {
    if (parsed.kind !== 'month') {
      // intercalary: fall back to safe string
      const safe = date.trim().replace(/[^0-9T-]/g, '');
      return safe.slice(0, 20) || 'event';
    }
    // Build YYYY-DDD scheme
    const absYear = Math.abs(parsed.year);
    const yearStr = (parsed.year < 0 ? '-' : '') + String(absYear).padStart(4, '0');
    const doy = String(cal.dayOfYear(parsed)).padStart(3, '0');
    const hasNonZeroTime = parsed.hour !== 0 || parsed.minute !== 0 || parsed.second !== 0;
    if (hasNonZeroTime) {
      const hh = String(parsed.hour).padStart(2, '0');
      const mm = String(parsed.minute).padStart(2, '0');
      const ss = String(parsed.second).padStart(2, '0');
      return `${yearStr}-${doy}T${hh}${mm}${ss}`;
    }
    return `${yearStr}-${doy}`;
  }
  // Unparseable: keep only filename-safe date characters as a fallback.
  const safe = date.trim().replace(/[^0-9T-]/g, '');
  return safe.slice(0, 20) || 'event';
}

export function deriveFilename(buf: EditorBuffer): string {
  const h1 = extractH1(buf.body);
  const titleToSlug = h1 ?? buf.title;
  const slug = slugify(titleToSlug);
  const datePart = deriveFilenameDatePart(buf.date);
  return `${datePart}-${slug || 'event'}.md`;
}

/**
 * The weekday-default colour an event would display for the given date, or
 * null if the date can't be parsed. Mirrors the timeline's fallback when an
 * event has no explicit colour.
 */
export function weekdayColorForDateText(dateText: string, weekdays: WeekdayColors): string | null {
  const cal = CalendarProvider.get();
  const d = cal.tryParse(dateText);
  return d ? weekdayColor(d, weekdays) : null;
}

/** Returns the <select> value for the color field (or '__custom__' for non-preset hex). */
export function getColorPresetValue(color: string): string {
  if (!color) return '';
  const presets = ThemeProvider.get().timeline.eventColorPresets;
  if (presets.some((p) => p.value === color && p.value !== '__custom__')) return color;
  return '__custom__';
}

export interface TagChip {
  raw: string;
  display: string;
  isEntity: boolean;
}

export function buildTagChips(
  tagsText: string,
  body: string,
  entityTagLabelMap: Map<string, string>,
  systemTags: string[] = [],
): TagChip[] {
  const customChips = parseTagsText(tagsText).map((t) => ({ raw: t, display: t, isEntity: false }));
  const sysChips = systemTags.map((t) => ({ raw: t, display: t, isEntity: false }));
  const entityChips = extractWikiLinkIds(body).map((id) => {
    const raw = formatEntityTag(id);
    const { display } = resolveEntityTagLabel(raw, entityTagLabelMap);
    return { raw, display, isEntity: true };
  });
  return [...customChips, ...sysChips, ...entityChips];
}
