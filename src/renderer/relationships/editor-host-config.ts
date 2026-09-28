/**
 * Builds the `relationshipDirectives` config passed to `MarkdownEditor` by
 * the notes and event editors. Assembling the host config here (rather than
 * inline in a hook or component body) keeps the wiring — and its IO — named
 * and testable in isolation from React.
 */
import type {
  ExternalSetConflictEntry,
  RelationshipDirectivesHostConfig,
} from '../shared/markdown-editor';
import type { PickerOption } from '../shared/searchable-picker';
import { parseDirectives, resolveTrack, type TrackLibrary } from '../../shared/relationships';
import { relationshipsData } from './data';
import { heldTagsByObserver } from './domain/held-options';

export interface HeldTagsDeps {
  library: TrackLibrary;
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

/** Finds the buffer directive whose blank at `anchor` is being edited, and its ordinal (used to exclude its own deltas — direct and mirrored — from a fold). */
function excludeOrdinalFor(doc: string, anchor: number): number | undefined {
  return parseDirectives(doc).directives.find((d) => d.from === anchor)?.ordinal;
}

/**
 * Builds the `heldTags` resolver — a Remove directive's tag and observer
 * blanks both read from the same lookup: the holder's held tags, by
 * observer, at the declaring event's date. Remove is event-only, so this
 * always has a `currentPath` (an unsaved-note query returns an empty map).
 * Fetches the holder's ledgers lazily — only when a Remove blank actually
 * lists its choices, via `relationshipsData.getLedgers(holder, 'holder')` —
 * and delegates the fold to `domain/held-options.ts`'s `heldTagsByObserver`.
 */
export function makeHeldTagsResolver(deps: HeldTagsDeps): HeldTagsResolver {
  return async ({ trackId, holder, anchor, doc }) => {
    const track = resolveTrack(trackId, deps.library);
    if (!track) return new Map();
    const path = deps.currentPath();
    if (!path) return new Map();

    const ledgers = await relationshipsData.getLedgers(holder, 'holder');
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
    },
  };
}
