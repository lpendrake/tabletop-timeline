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
import {
  heldOptionsByObserver,
  heldOptionsForBuffer,
  observersHolding,
  unionHeldOptions,
} from './domain/held-options';

export interface ConfirmFn {
  (options: { title?: string; message: string; confirmLabel?: string }): Promise<boolean>;
}

/**
 * Builds the callback a directive's holder blank invokes when a note is chosen for
 * the holder role and no default reputation holder is set yet. It always
 * offers to make that note the default (there's no "don't ask again"), and
 * saves it via `relationshipsData` on a yes.
 *
 * Returns a `Promise` that resolves only once the dialog is answered (and,
 * on a yes, the save has completed) — the editor waits for it, then takes
 * focus back and reopens the next blank's choices, since the dialog will
 * have taken focus (see `relationship-directive-completions.ts`).
 */
export function makeHolderChosenHandler(
  confirm: ConfirmFn,
  labelFor: (id: string) => string,
): (id: string) => Promise<void> {
  return async (id: string) => {
    const yes = await confirm({
      title: 'Default Reputation Holder',
      message: `Make ${labelFor(id)} the default reputation holder?`,
      confirmLabel: 'Make default',
    });
    if (yes) await relationshipsData.setDefaultHolder(id);
  };
}

export interface HeldOptionsDeps {
  library: TrackLibrary;
  /** Campaign-relative path of the note/event currently open, or null if unsaved. */
  currentPath: () => string | null;
  /** The point in in-game time the directive is declared at: an event's date, or null for a note (undated baseline). */
  at: () => number | null;
}

/** Finds the buffer directive whose blank at `anchor` is being edited, and its ordinal (used to exclude its own deltas — direct and mirrored — from a fold). */
function excludeOrdinalFor(doc: string, anchor: number): number | undefined {
  return parseDirectives(doc).directives.find((d) => d.from === anchor)?.ordinal;
}

/**
 * Builds the `heldOptions` resolver — a Remove directive's tag
 * blank. Remove is event-only, so this always has a `currentPath` (an
 * unsaved-note query returns `[]`). Fetches the holder's ledgers lazily —
 * only when a Remove's tag blank actually lists its choices, via
 * `relationshipsData.getLedgers(holder, 'holder')` — instead of loading
 * every ledger up front on every keystroke.
 *
 * `observer` is optional: the template fills holder, then the tag, then
 * the observer, so in the normal fill order the tag blank opens with no
 * observer chosen yet — that queries the UNION of tags the holder holds
 * with *anyone* on this track (`heldOptionsByObserver`/`unionHeldOptions`).
 * When the observer is already known (filled out of order, or the tag
 * blank is reopened after the observer is set), it narrows to that one
 * (holder, observer) ledger instead — today's behaviour, via
 * `heldOptionsForBuffer`. Both delegate the actual fold to
 * `domain/held-options.ts`, which drops the saved copy of the current
 * file's deltas and re-derives them from the buffer's live directives
 * (via the shared `deltasForFile`, so same-event mirrors are included).
 */
export function makeHeldOptionsResolver(deps: HeldOptionsDeps): HeldOptionsResolver {
  return async ({ trackId, holder, observer, anchor, doc }) => {
    if (!holder) return [];
    const track = resolveTrack(trackId, deps.library);
    if (!track) return [];
    const path = deps.currentPath();
    if (!path) return [];

    const ledgers = await relationshipsData.getLedgers(holder, 'holder');
    const at = deps.at();
    const excludeOrdinal = excludeOrdinalFor(doc, anchor);

    if (observer) {
      const ledger = ledgers.find((l) => l.observer === observer && l.track === trackId) ?? {
        holder,
        observer,
        track: trackId,
        deltas: [],
      };
      return heldOptionsForBuffer({
        ledger,
        track,
        library: deps.library,
        doc,
        path,
        at,
        excludeOrdinal,
      });
    }

    const byObserver = heldOptionsByObserver({
      holder,
      trackId,
      track,
      library: deps.library,
      ledgers,
      doc,
      path,
      at,
      excludeOrdinal,
    });
    return unionHeldOptions(byObserver);
  };
}

export type HeldOptionsResolver = (q: {
  trackId: string;
  holder: string | null;
  observer: string | null;
  anchor: number;
  doc: string;
}) => Promise<string[]>;

/**
 * Builds the `observerOptions` resolver — a Remove directive's
 * observer blank, once the holder and tag are both filled. Restricts the
 * note picker to observers where (holder, observer) actually holds that
 * tag on this track as of the event's date, via the same
 * `heldOptionsByObserver` fold `heldOptions` (the tag step) uses, filtered
 * with `observersHolding` instead of unioned.
 */
export function makeObserverOptionsResolver(deps: HeldOptionsDeps): ObserverOptionsResolver {
  return async ({ trackId, holder, option, anchor, doc }) => {
    if (!holder) return [];
    const track = resolveTrack(trackId, deps.library);
    if (!track) return [];
    const path = deps.currentPath();
    if (!path) return [];

    const ledgers = await relationshipsData.getLedgers(holder, 'holder');
    const byObserver = heldOptionsByObserver({
      holder,
      trackId,
      track,
      library: deps.library,
      ledgers,
      doc,
      path,
      at: deps.at(),
      excludeOrdinal: excludeOrdinalFor(doc, anchor),
    });
    return observersHolding(byObserver, option);
  };
}

export type ObserverOptionsResolver = (q: {
  trackId: string;
  holder: string | null;
  option: string;
  anchor: number;
  doc: string;
}) => Promise<string[]>;

export interface RelationshipEditorConfigDeps {
  library: TrackLibrary;
  defaultReason: string;
  onOpenNote?: (id: string) => void;
  /** Whether this host is a note (undated) or an event — see `RelationshipDirectivesHostConfig.place`. Required: every host must say which it is explicitly. */
  place: 'note' | 'event';
  noteOptions: () => readonly PickerOption[];
  defaultHolderId: () => string | null;
  currentNoteId: () => string | null;
  onHolderChosenWithoutDefault?: (id: string) => void | Promise<void>;
  heldOptions?: HeldOptionsResolver;
  observerOptions?: ObserverOptionsResolver;
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
    choices: {
      noteOptions: () => deps.noteOptions() as PickerOption[],
      defaultHolderId: deps.defaultHolderId,
      currentNoteId: deps.currentNoteId,
      onHolderChosenWithoutDefault: deps.onHolderChosenWithoutDefault,
      createOption: async (trackId, label, mutual) => {
        const result = await relationshipsData.addOption(trackId, { label, mutual });
        return result.ok ? { key: result.option.key } : null;
      },
      heldOptions: deps.heldOptions,
      observerOptions: deps.observerOptions,
    },
  };
}
