/**
 * Builds the `relationshipDirectives` config passed to `MarkdownEditor` by
 * the notes and event editors. Assembling the host config here (rather than
 * inline in a hook or component body) keeps the wiring — and its IO — named
 * and testable in isolation from React.
 */
import type { RelationshipDirectivesHostConfig } from '../shared/markdown-editor';
import type { PickerOption } from '../shared/searchable-picker';
import { parseDirectives, resolveTrack, type TrackLibrary } from '../../shared/relationships';
import { relationshipsData } from './data';
import { heldOptionsForBuffer } from './domain/held-options';

export interface ConfirmFn {
  (options: { title?: string; message: string; confirmLabel?: string }): Promise<boolean>;
}

/**
 * Builds the callback the fill-in bubble invokes when a note is chosen for
 * the holder role and no default reputation holder is set yet. It always
 * offers to make that note the default (there's no "don't ask again"), and
 * saves it via `relationshipsData` on a yes.
 */
export function makeHolderChosenHandler(
  confirm: ConfirmFn,
  labelFor: (id: string) => string,
): (id: string) => void {
  return (id: string) => {
    void confirm({
      title: 'Default Reputation Holder',
      message: `Make ${labelFor(id)} the default reputation holder?`,
      confirmLabel: 'Make default',
    }).then((yes) => {
      if (yes) return relationshipsData.setDefaultHolder(id);
    });
  };
}

export interface HeldOptionsDeps {
  library: TrackLibrary;
  /** Campaign-relative path of the note/event currently open, or null if unsaved. */
  currentPath: () => string | null;
  /** The point in in-game time the directive is declared at: an event's date, or null for a note (undated baseline). */
  at: () => number | null;
}

/**
 * Builds the bubble's `heldOptions` resolver. Remove is event-only, so this
 * always has a `currentPath` (an unsaved-note query returns `[]`). Fetches
 * the (holder, observer, track) ledger lazily — only when a "remove" bubble
 * actually opens, via `relationshipsData.getLedgers` — instead of loading
 * every ledger up front on every keystroke, then delegates the fold to the
 * pure `heldOptionsForBuffer`, which drops the saved copy of the current
 * file's deltas and re-derives them from the buffer's live directives (see
 * `domain/held-options.ts`).
 */
export function makeHeldOptionsResolver(deps: HeldOptionsDeps): HeldOptionsResolver {
  return async ({ trackId, holder, observer, anchor, doc }) => {
    if (!holder || !observer) return [];
    const track = resolveTrack(trackId, deps.library);
    if (!track) return [];
    const path = deps.currentPath();
    if (!path) return [];

    const ledgers = await relationshipsData.getLedgers(holder, 'holder');
    const ledger = ledgers.find((l) => l.observer === observer && l.track === trackId) ?? {
      holder,
      observer,
      track: trackId,
      deltas: [],
    };

    const directive = parseDirectives(doc).directives.find((d) => d.from === anchor);

    return heldOptionsForBuffer({
      ledger,
      track,
      library: deps.library,
      doc,
      path,
      at: deps.at(),
      excludeOrdinal: directive?.ordinal,
    });
  };
}

export type HeldOptionsResolver = (q: {
  trackId: string;
  holder: string | null;
  observer: string | null;
  anchor: number;
  doc: string;
}) => Promise<string[]>;

export interface RelationshipEditorConfigDeps {
  library: TrackLibrary;
  defaultReason: string;
  onOpenNote?: (id: string) => void;
  /** Whether this host is a note (undated) or an event. Defaults to `'event'` when omitted — see `RelationshipDirectivesHostConfig.place`. */
  place?: 'note' | 'event';
  noteOptions: () => readonly PickerOption[];
  defaultHolderId: () => string | null;
  currentNoteId: () => string | null;
  onHolderChosenWithoutDefault?: (id: string) => void;
  heldOptions?: HeldOptionsResolver;
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
    bubbles: {
      noteOptions: () => deps.noteOptions() as PickerOption[],
      defaultHolderId: deps.defaultHolderId,
      currentNoteId: deps.currentNoteId,
      onHolderChosenWithoutDefault: deps.onHolderChosenWithoutDefault,
      createOption: async (trackId, label, mutual) => {
        const result = await relationshipsData.addOption(trackId, { label, mutual });
        return result.ok ? { key: result.option.key } : null;
      },
      heldOptions: deps.heldOptions,
    },
  };
}
