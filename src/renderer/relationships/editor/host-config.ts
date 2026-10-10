/**
 * Builds the `relationshipDirectives` config passed to `MarkdownEditor` by
 * the notes and event editors. Assembling the host config here (rather than
 * inline in a hook or component body) keeps the wiring — and its IO — named
 * and testable in isolation from React.
 */
import type { RelationshipDirectivesHostConfig } from '../../shared/markdown-editor';
import type { ExternalSetConflictEntry } from './directives';
import type { PickerOption } from '../../shared/searchable-picker';
import {
  parseDirectives,
  resolveTrack,
  type Ledger,
  type TrackLibrary,
} from '../../../shared/relationships';
import { relationshipsData } from '../data';
import { heldTagsByObserver } from '../domain/held-options';
import { trackUsageProximity } from '../domain/track-usage';

export interface HeldTagsDeps {
  library: TrackLibrary;
  /** Every saved ledger, from the editor's ledger snapshot (see `ledger-snapshot.ts`). */
  ledgers: () => Promise<Ledger[]>;
  /** Campaign-relative path of the note/event currently open, or null if unsaved. */
  currentPath: () => string | null;
  /** The point in in-game time the directive is declared at: an event's date, or null for a note (undated baseline). */
  at: () => number | null;
}

export type HeldTagsResolver = (q: {
  trackId: string;
  holder: string;
  anchor: number;
  doc: string;
}) => Promise<Map<string, string[]>>;

export interface TrackUsageDeps extends HeldTagsDeps {
  /** Whether this host is a note (undated) or an event — see `RelationshipDirectivesHostConfig.place`. */
  place: 'note' | 'event';
}

export type TrackUsageResolver = (q: {
  trackId: string;
  anchor: number;
  doc: string;
}) => Promise<Map<string, number | null>>;

/** Finds the buffer directive whose blank at `anchor` is being edited, and its ordinal (used to exclude its own deltas — direct and mirrored — from a fold). */
function excludeOrdinalFor(doc: string, anchor: number): number | undefined {
  return parseDirectives(doc).directives.find((d) => d.from === anchor)?.ordinal;
}

/**
 * Builds the `heldTags` resolver — a Remove directive's tag and observer
 * blanks both read from the same lookup: the holder's held tags, by
 * observer, at the declaring event's date. Remove is event-only, so this
 * always has a `currentPath` (an unsaved-note query returns an empty map).
 * Reads the holder's ledgers from `deps.ledgers` only when a Remove blank
 * actually lists its choices, and delegates the fold to
 * `domain/held-options.ts`'s `heldTagsByObserver`.
 */
export function makeHeldTagsResolver(deps: HeldTagsDeps): HeldTagsResolver {
  return async ({ trackId, holder, anchor, doc }) => {
    const track = resolveTrack(trackId, deps.library);
    if (!track) return new Map();
    const path = deps.currentPath();
    if (!path) return new Map();

    const ledgers = (await deps.ledgers()).filter((l) => l.holder === holder);
    return heldTagsByObserver({
      holder,
      track,
      library: deps.library,
      ledgers,
      doc,
      path,
      at: deps.at(),
      excludeOrdinal: excludeOrdinalFor(doc, anchor),
    });
  };
}

/**
 * Builds the `trackUsage` resolver: which notes the track already uses, and
 * how near each use is to the declaring date. Unlike `heldTags` it does not
 * need a saved path — an unsaved buffer still counts the saved ledgers plus
 * the buffer. Reads every ledger from `deps.ledgers` only when a blank asks
 * for its choices, and delegates to `domain/track-usage.ts`.
 */
export function makeTrackUsageResolver(deps: TrackUsageDeps): TrackUsageResolver {
  return async ({ trackId, anchor, doc }) => {
    const track = resolveTrack(trackId, deps.library);
    if (!track) return new Map();

    const ledgers = await deps.ledgers();
    return trackUsageProximity({
      ledgers,
      library: deps.library,
      trackId: track.id,
      path: deps.currentPath(),
      doc,
      isEvent: deps.place === 'event',
      at: deps.at(),
      excludeOrdinal: excludeOrdinalFor(doc, anchor),
    });
  };
}

export interface RelationshipEditorConfigDeps {
  library: TrackLibrary;
  defaultReason: string;
  onOpenNote?: (id: string) => void;
  /** Whether this host is a note (undated) or an event — see `RelationshipDirectivesHostConfig.place`. Required: every host must say which it is explicitly. */
  place: 'note' | 'event';
  noteOptions: () => readonly PickerOption[];
  defaultHolderId: () => string | null;
  currentNoteId: () => string | null;
  heldTags?: HeldTagsResolver;
  trackUsage: TrackUsageResolver;
  /** Every undated Set declared in another saved note (this buffer's own path already excluded). Note editors only. */
  externalSetConflicts?: ExternalSetConflictEntry[];
}

/** Assembles the full `relationshipDirectives` host config from its pieces. */
export function buildRelationshipEditorConfig(
  deps: RelationshipEditorConfigDeps,
): RelationshipDirectivesHostConfig {
  return {
    library: deps.library,
    defaultReason: deps.defaultReason,
    onOpenNote: deps.onOpenNote,
    place: deps.place,
    externalSetConflicts: deps.externalSetConflicts,
    choices: {
      noteOptions: () => deps.noteOptions() as PickerOption[],
      defaultHolderId: deps.defaultHolderId,
      currentNoteId: deps.currentNoteId,
      setDefaultHolder: (id) => relationshipsData.setDefaultHolder(id),
      createOption: async (trackId, label, mutual) => {
        const result = await relationshipsData.addOption(trackId, { label, mutual });
        return result.ok ? { key: result.option.key } : null;
      },
      heldTags: deps.heldTags,
      trackUsage: deps.trackUsage,
    },
  };
}
