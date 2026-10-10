/**
 * Choices for a relationship directive's blank, offered through the editor's
 * shared autocompletion (see `editor-completions.ts`): notes for a holder or
 * observer, tags for an option, rungs for an ordinal value. The blank's own
 * text is the query — there is no separate input and no draft; picking
 * writes the chosen key/link into the value and moves the caret on to the
 * next blank, whose choices then open by themselves.
 *
 * Ranking, filtering and create rules are pure and live in
 * `domain/directive-values.ts`; this file only wires them to CodeMirror and
 * the host's (possibly async) lookups.
 */
import {
  CompletionContext as Context,
  acceptCompletion,
  completionStatus,
  pickedCompletion,
  selectedCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSection,
} from '@codemirror/autocomplete';
import { MapMode, Prec, type EditorState, type Extension, type Text } from '@codemirror/state';
import { EditorView, ViewPlugin, keymap, type Command, type ViewUpdate } from '@codemirror/view';
import {
  noteIdOf,
  noteRoleValue,
  roleValue,
  type ActionKind,
  type ParsedDirective,
  type Role,
} from '../../../shared/relationships';
import type { PickerOption } from '../../shared/searchable-picker';
import {
  completionReactivates,
  completionSources,
  editorAutocompletion,
} from '../../shared/markdown-editor/extensions/editor-completions';
import { directivesIn } from './parsed-directives';
import { adjacentSlot, roleHasChoices } from '../domain/directive-layout';
import { displayFor, liveSlotAt, moveToAdjacentBlank } from './directives';
import {
  allowsCreateOption,
  filterHeldOptions,
  matchNoteOptions,
  observersHoldingTag,
  rankLabelled,
  pinnedDefaultHolder,
  sectionNotes,
  shouldOfferCreateOption,
  unionHeldTags,
  type NoteUsage,
  type SectionedNote,
} from '../domain/directive-values';

/** Which holder a Remove blank's tags should be fetched for, plus the directive's position and the buffer's text so the host can exclude this directive's own delta. */
export interface HeldTagsQuery {
  trackId: string;
  holder: string;
  anchor: number;
  doc: string;
}

/** Which track's usage a holder/observer blank should be sectioned by, plus the directive's position and the buffer's text so the host can exclude this directive's own delta. */
export interface TrackUsageQuery {
  trackId: string;
  anchor: number;
  doc: string;
}

/** Host data and callbacks the blanks' choices need. */
export interface RelationshipCompletionOptions {
  noteOptions: () => readonly PickerOption[];
  defaultHolderId?: () => string | null;
  currentNoteId?: () => string | null;
  /** Sets the default reputation holder (e.g. from the holder blank's "…and make it the default holder" row). */
  setDefaultHolder?: (id: string) => void | Promise<void>;
  createOption?: (
    trackId: string,
    label: string,
    mutual: boolean,
  ) => Promise<{ key: string } | null>;
  /** The holder's held tags, by observer, at the declaring event's date. A rejection shows every tag/note, unfiltered. */
  heldTags?: (q: HeldTagsQuery) => Promise<Map<string, string[]>>;
  /**
   * The notes the track already uses: note id to the absolute distance in
   * seconds to that note's nearest entry on the track, or `null` for a used
   * note with no dated proximity. Ids absent from the map are not used. A
   * missing callback or a rejection lists every note as not used.
   */
  trackUsage?: (q: TrackUsageQuery) => Promise<Map<string, number | null>>;
}

/** At most this many notes are listed; typing narrows the rest. */
const NOTE_LIMIT = 50;

/**
 * Async host lookups, cached per exact query for as long as the document is
 * unchanged. Keyed on the immutable `Text` object, so any edit starts fresh
 * and a stale answer can never be served for a changed buffer.
 */
const lookupCache = new WeakMap<Text, Map<string, Promise<unknown>>>();

function cachedLookup<T>(
  doc: Text,
  key: string,
  run: (() => Promise<T>) | null,
): Promise<T | null> {
  if (!run) return Promise.resolve(null);
  let byKey = lookupCache.get(doc);
  if (!byKey) {
    byKey = new Map();
    lookupCache.set(doc, byKey);
  }
  let pending = byKey.get(key) as Promise<T | null> | undefined;
  if (!pending) {
    pending = run().then(
      (result) => result,
      () => null,
    );
    byKey.set(key, pending);
  }
  return pending;
}

/**
 * Writes `value` into the blank at `from`–`to` and selects the next blank's
 * value (or puts the caret just past the directive after the last one), as
 * one transaction and one undo step.
 */
export function writeAndAdvance(
  view: EditorView,
  completion: Completion | null,
  from: number,
  to: number,
  value: string,
): void {
  const changes = { from, to, insert: value };
  const after = view.state.update({ changes }).state;
  const end = from + value.length;
  const directive = directivesIn(after).find((d) => d.from <= end && end <= d.to);
  const next = directive ? adjacentSlot(directive, end, 1) : null;
  // Like Tab, arriving in the next blank selects its whole value.
  const selection = next ? { anchor: next.from, head: next.to } : { anchor: directive?.to ?? end };
  view.dispatch({
    changes,
    selection,
    userEvent: 'input.complete',
    annotations: completion ? pickedCompletion.of(completion) : [],
    scrollIntoView: true,
  });
}

function pick(
  value: string,
  label: string,
  detail?: string,
  section?: CompletionSection,
  onPicked?: (view: EditorView) => void,
): Completion {
  return completionReactivates({
    label,
    detail,
    section,
    apply: (view, completion, from, to) => {
      writeAndAdvance(view, completion, from, to, value);
      onPicked?.(view);
    },
  });
}

function noteCompletions(
  role: Role,
  notes: readonly SectionedNote[],
  opts: RelationshipCompletionOptions,
): Completion[] {
  const defaultHolderId = opts.defaultHolderId?.() ?? null;
  const currentNoteId = opts.currentNoteId?.() ?? null;
  // No default reputation holder is set yet: alongside the normal pick, the
  // holder blank offers a second row that also makes the note the default —
  // there's no separate dialog, so the list never loses focus.
  const offerDefault = role === 'holder' && !defaultHolderId && Boolean(opts.setDefaultHolder);
  return notes.slice(0, NOTE_LIMIT).flatMap(({ option, section }) => {
    const label = option.label ?? option.path;
    const detail =
      role === 'holder' && option.id === defaultHolderId
        ? 'default holder'
        : option.id === currentNoteId
          ? 'this note'
          : undefined;
    const plain = pick(noteRoleValue(option.id), label, detail, section ?? undefined);
    if (!offerDefault) return [plain];
    const makeDefault = pick(
      noteRoleValue(option.id),
      `Use ${label} and make it the default holder`,
      undefined,
      section ?? undefined,
      () => {
        void opts.setDefaultHolder?.(option.id);
      },
    );
    return [plain, makeDefault];
  });
}

// ---------------------------------------------------------------------------
// Positions that follow the document while something async is in flight.
// ---------------------------------------------------------------------------

interface TrackedPos {
  /** Current position, or null once the text around it was deleted. */
  pos: number | null;
}

const trackedPositions = new WeakMap<EditorView, Set<TrackedPos>>();

/** Keeps `pos` pointing at the same place through every later edit, until released. */
function trackPos(view: EditorView, pos: number): { current: TrackedPos; release: () => void } {
  const current: TrackedPos = { pos };
  let set = trackedPositions.get(view);
  if (!set) {
    set = new Set();
    trackedPositions.set(view, set);
  }
  set.add(current);
  return { current, release: () => set.delete(current) };
}

const mapTrackedPositions = ViewPlugin.fromClass(
  class {
    update(update: ViewUpdate) {
      if (!update.docChanged) return;
      for (const tracked of trackedPositions.get(update.view) ?? []) {
        if (tracked.pos !== null) {
          tracked.pos = update.changes.mapPos(tracked.pos, -1, MapMode.TrackDel);
        }
      }
    }
  },
);

// ---------------------------------------------------------------------------
// Create rows are only ever picked on purpose.
// ---------------------------------------------------------------------------

const createRows = new WeakSet<Completion>();

/** Editors where the user has moved the list's highlight since it last changed. */
const steered = new WeakSet<EditorView>();

const noteSteering = [
  Prec.highest(
    EditorView.domEventHandlers({
      keydown(event, view) {
        const moves = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'];
        if (moves.includes(event.key) && completionStatus(view.state) === 'active') {
          steered.add(view);
        }
        return false;
      },
    }),
  ),
  ViewPlugin.fromClass(
    class {
      update(update: ViewUpdate) {
        if (update.docChanged || completionStatus(update.state) !== 'active') {
          steered.delete(update.view);
        }
      }
    },
  ),
];

function createCompletion(
  directive: ParsedDirective,
  query: string,
  mutual: boolean,
  createOption: NonNullable<RelationshipCompletionOptions['createOption']>,
): Completion {
  const label = query.trim();
  const completion: Completion = completionReactivates({
    label: mutual ? `Create "${label}" (symmetrical)` : `Create "${label}"`,
    apply: (view, picked, from) => {
      // The host may take a while (it writes the track file); keep hold of
      // this blank's position through any edits made meanwhile.
      const tracked = trackPos(view, from);
      void createOption(directive.trackId, label, mutual).then((created) => {
        tracked.release();
        const pos = tracked.current.pos;
        if (!created || pos === null || !view.dom.isConnected) return;
        const hit = liveSlotAt(view.state, pos);
        // Only write it if the blank is still the one it was created from.
        if (!hit || hit.slot.role !== 'option' || hit.slot.value.trim() !== label) return;
        writeAndAdvance(view, picked, hit.slot.from, hit.slot.to, created.key);
      });
    },
  });
  createRows.add(completion);
  return completion;
}

/**
 * A blank's choices before any async narrowing, best first. Cheap and
 * synchronous, so a key press can tell straight away whether a typed query
 * matches anything at all.
 */
function baseChoices(
  state: EditorState,
  hit: NonNullable<ReturnType<typeof liveSlotAt>>,
  opts: RelationshipCompletionOptions,
): { query: string; choices: PickerOption[] } {
  const { slot, model } = hit;
  const track = model.track;
  const query = displayFor(state, model, slot).kind === 'text' ? slot.value : '';
  if (slot.role === 'holder' || slot.role === 'observer') {
    const choices = matchNoteOptions(opts.noteOptions(), query).map((m) => m.option);
    return { query, choices };
  }
  if (slot.role === 'option' && track?.kind === 'categorical') {
    const all = track.options.map((o) => ({ id: o.key, path: o.label, label: o.label }));
    return { query, choices: rankLabelled(all, query) };
  }
  if (slot.role === 'value' && track?.kind === 'ordinal') {
    const rungs = track.rungs.map((r) => ({ id: r.key, path: r.label, label: r.label }));
    return { query, choices: rankLabelled(rungs, query) };
  }
  return { query, choices: [] };
}

/** The async narrowing a Remove applies: held tags, or observers sharing the tag. `null` = no narrowing. */
async function narrowing(
  state: EditorState,
  directive: ParsedDirective,
  role: Role,
  actionKind: ActionKind | undefined,
  opts: RelationshipCompletionOptions,
): Promise<string[] | null> {
  if (actionKind !== 'remove' || (role !== 'observer' && role !== 'option')) {
    return Promise.resolve(null);
  }
  const holder = noteIdOf(roleValue(directive, 'holder') ?? '');
  if (role === 'observer' && !roleValue(directive, 'option')) return Promise.resolve(null);

  const doc = state.doc.toString();
  const lookup = opts.heldTags;
  const run =
    holder && lookup
      ? () => lookup({ trackId: directive.trackId, holder, anchor: directive.from, doc })
      : null;
  // One cached call per holder, shared by both the tag and observer blanks.
  const byObserver = await cachedLookup(state.doc, `held:${directive.from}:${holder}`, run);
  if (byObserver === null) return null;

  if (role === 'observer') {
    const option = roleValue(directive, 'option') as string;
    return observersHoldingTag(byObserver, option);
  }
  const observer = noteIdOf(roleValue(directive, 'observer') ?? '');
  return observer ? (byObserver.get(observer) ?? []) : unionHeldTags(byObserver);
}

/** The notes the track already uses, or `null` when unknown (no host callback, or the lookup failed). */
function trackUsage(
  state: EditorState,
  directive: ParsedDirective,
  opts: RelationshipCompletionOptions,
): Promise<NoteUsage | null> {
  const lookup = opts.trackUsage;
  const doc = state.doc.toString();
  const run = lookup
    ? () => lookup({ trackId: directive.trackId, anchor: directive.from, doc })
    : null;
  return cachedLookup(state.doc, `usage:${directive.from}:${directive.trackId}`, run);
}

async function completeBlank(
  context: CompletionContext,
  getOptions: () => RelationshipCompletionOptions,
): Promise<CompletionResult | null> {
  const { state } = context;
  const hit = liveSlotAt(state, context.pos);
  const track = hit?.model.track;
  if (!hit || !track || !roleHasChoices(hit.slot.role, track)) return null;
  const { directive, slot } = hit;
  const opts = getOptions();
  const action = track.action(directive.actionKey);
  const { query, choices } = baseChoices(state, hit, opts);
  const narrowed = filterHeldOptions(
    choices,
    await narrowing(state, directive, slot.role, action?.kind, opts),
  );
  if (context.aborted) return null;

  let options: Completion[];
  if (slot.role === 'holder' || slot.role === 'observer') {
    const usage = await trackUsage(state, directive, opts);
    if (context.aborted) return null;
    const notes = sectionNotes({
      role: slot.role,
      options: narrowed,
      query,
      usage,
      defaultHolderId: opts.defaultHolderId?.() ?? null,
    });
    options = noteCompletions(slot.role, notes, opts);
  } else {
    options = narrowed.map((o) => pick(o.id, o.label ?? o.path));
  }

  if (
    slot.role === 'option' &&
    opts.createOption &&
    allowsCreateOption(action?.kind) &&
    shouldOfferCreateOption(query, narrowed)
  ) {
    options.push(createCompletion(directive, query, false, opts.createOption));
    options.push(createCompletion(directive, query, true, opts.createOption));
  }

  if (options.length === 0) return null;
  return { from: slot.from, to: slot.to, options, filter: false };
}

/**
 * Tab or Enter on a typed query (or an empty holder blank with a pinned
 * default holder) picks a real match without waiting on the popup: the highlighted one when the list is open, otherwise the first row
 * the source would show, computed straight from it — so typing "spi" and pressing Tab
 * always fills Spire Watch, however fast it's typed.
 *
 * Never a "Create …" row unless the user moved the highlight onto it:
 * creating a tag is permanent, so a typo plus Tab must not do it. And when
 * nothing matches, the key isn't taken, so the directive keymap moves on to
 * the next blank as usual, leaving the typed text (shown as a problem).
 */
function makeAcceptTypedQuery(getOptions: () => RelationshipCompletionOptions): Command {
  return (view) => {
    const { state } = view;
    const sel = state.selection.main;
    const hit = sel.empty ? liveSlotAt(state, sel.head) : null;
    if (!hit || !roleHasChoices(hit.slot.role, hit.model.track)) return false;
    const opts = getOptions();
    const { query, choices } = baseChoices(state, hit, opts);
    // An empty holder blank with a default holder pinned first picks it; a
    // blank already holding a note (empty query) moves on.
    const pinned =
      hit.slot.value === ''
        ? pinnedDefaultHolder({
            role: hit.slot.role,
            query,
            defaultHolderId: opts.defaultHolderId?.() ?? null,
            options: choices,
          })
        : null;
    if (!pinned && (hit.slot.value === '' || !query)) return false;

    if (completionStatus(state) === 'active') {
      const selected = selectedCompletion(state);
      const explicitCreate = selected && createRows.has(selected) && steered.has(view);
      if (selected && (!createRows.has(selected) || explicitCreate) && acceptCompletion(view)) {
        return true;
      }
    }
    if (choices.length === 0) return false;

    const doc = state.doc;
    void completeBlank(new Context(state, sel.head, true), getOptions).then((result) => {
      // Drop the answer if the buffer changed while it was being worked out.
      if (view.state.doc !== doc) return;
      const top = result?.options.find((o) => !createRows.has(o));
      if (result && top && typeof top.apply === 'function') {
        top.apply(view, top, result.from, result.to ?? result.from);
      } else {
        moveToAdjacentBlank(view, 1);
      }
    });
    return true;
  };
}

/**
 * Offers choices inside relationship directive blanks. Registered ahead of
 * the `[[` / `@` link source so a blank always gets its own list.
 */
export function relationshipDirectiveCompletions(
  getOptions: () => RelationshipCompletionOptions,
): Extension {
  const acceptTyped = makeAcceptTypedQuery(getOptions);
  return [
    editorAutocompletion,
    Prec.high(completionSources.of((context) => completeBlank(context, getOptions))),
    mapTrackedPositions,
    noteSteering,
    // Ahead of the directive keymap's own Tab/Enter (which move between blanks).
    Prec.highest(
      keymap.of([
        { key: 'Tab', run: acceptTyped },
        { key: 'Enter', run: acceptTyped },
      ]),
    ),
  ];
}
