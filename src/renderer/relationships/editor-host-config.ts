/**
 * Builds the `relationshipDirectives` config passed to `MarkdownEditor` by
 * the notes and event editors. Assembling the host config here (rather than
 * inline in a hook or component body) keeps the wiring — and its IO — named
 * and testable in isolation from React.
 */
import type { RelationshipDirectivesHostConfig } from '../shared/markdown-editor';
import type { PickerOption } from '../shared/searchable-picker';
import {
  parseDirectives,
  resolveTrack,
  type Ledger,
  type TrackLibrary,
} from '../../shared/relationships';
import { relationshipsData } from './data';
import { heldOptionsAt, type HeldOptionsExclude } from './domain/held-options';

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
  /** Snapshot of every ledger, refreshed by the caller on `relationshipsData.onChanged`. */
  getLedgers: () => readonly Ledger[];
  /** Campaign-relative path of the note/event currently open, or null if unsaved. */
  currentPath: () => string | null;
  /** The point in in-game time the directive is declared at: an event's date, or null for a note (undated baseline). */
  at: () => number | null;
}

/**
 * Builds the bubble's `heldOptions` resolver: looks up the (holder,
 * observer, track) ledger, locates the directive being edited (in the
 * buffer text the bubble itself supplies) to exclude it from the fold, and
 * delegates to the pure `heldOptionsAt`. Async to match
 * `RelationshipBubbleOptions.heldOptions` — this host has no IO of its own
 * to await, but the contract is async so a host that does (a main-process
 * ledger store) can implement it the same way.
 */
export function makeHeldOptionsResolver(deps: HeldOptionsDeps): HeldOptionsResolver {
  return async ({ trackId, holder, observer, anchor, doc }) => {
    if (!holder || !observer) return [];
    const track = resolveTrack(trackId, deps.library);
    if (!track) return [];

    const ledger = deps
      .getLedgers()
      .find((l) => l.holder === holder && l.observer === observer && l.track === trackId);
    if (!ledger) return [];

    const path = deps.currentPath();
    let exclude: HeldOptionsExclude | undefined;
    if (path) {
      const directive = parseDirectives(doc).directives.find((d) => d.from === anchor);
      if (directive) exclude = { path, ordinal: directive.ordinal };
    }

    return heldOptionsAt(ledger, track, deps.at(), exclude);
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
