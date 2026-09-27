/**
 * Choices for a relationship directive's blank, offered through the editor's
 * shared autocompletion (see `editor-completions.ts`): notes for a holder or
 * observer, tags for an option, rungs for an ordinal value. The blank's own
 * text is the query — there is no separate input and no draft; picking
 * writes the chosen key/link into the value and moves the caret on to the
 * next blank, whose choices then open by themselves.
 *
 * Ranking, filtering and create rules are pure and live in
 * `relationship-value-logic.ts`; this file only wires them to CodeMirror and
 * the host's (possibly async) lookups.
 */
import {
  CompletionContext as Context,
  acceptCompletion,
  completionStatus,
  pickedCompletion,
  selectedCompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
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
} from '../../../../shared/relationships';
import type { PickerOption } from '../../searchable-picker';
import {
  completionReactivates,
  completionSources,
  editorAutocompletion,
} from './editor-completions';
import { directivesIn } from './parsed-directives';
import { adjacentSlot, roleHasChoices } from './relationship-directive-layout';
import { displayFor, liveSlotAt, moveToAdjacentBlank } from './relationship-directives';
import {
  allowsCreateOption,
  filterHeldOptions,
  noteChoices,
  rankLabelled,
  shouldNotifyHolderChosen,
  shouldOfferCreateOption,
} from './relationship-value-logic';
import { getRecentNoteIds, rememberRecentNote } from './relationship-recent-notes';

/**
 * Which (track, holder, observer) ledger a Remove's tag blank should fold to
 * find the tags currently held, plus the directive's position and the
 * buffer's text so the host can exclude this directive's own delta.
 */
export interface HeldOptionsQuery {
  trackId: string;
  holder: string | null;
  /** `null` while the observer is still empty — the host then unions tags the holder holds with anyone. */
  observer: string | null;
  anchor: number;
  doc: string;
}

/** Which notes a Remove's observer blank may offer: those that hold `option` with `holder`. */
export interface ObserverOptionsQuery {
  trackId: string;
  holder: string;
  option: string;
  anchor: number;
  doc: string;
}

/** Host data and callbacks the blanks' choices need. */
export interface RelationshipCompletionOptions {
  noteOptions: () => readonly PickerOption[];
  defaultHolderId?: () => string | null;
  currentNoteId?: () => string | null;
  /** Called after a holder is picked while no default holder is set (e.g. to offer making it the default). */
  onHolderChosenWithoutDefault?: (id: string) => void | Promise<void>;
  createOption?: (
    trackId: string,
    label: string,
    mutual: boolean,
  ) => Promise<{ key: string } | null>;
  /** Tag keys currently held on the ledger. A rejection shows every tag, unfiltered. */
  heldOptions?: (q: HeldOptionsQuery) => Promise<string[]>;
  /** Note ids that can be a Remove's observer. A rejection shows every note, unfiltered. */
  observerOptions?: (q: ObserverOptionsQuery) => Promise<string[]>;
}

/** At most this many notes are listed; typing narrows the rest. */
const NOTE_LIMIT = 50;

/**
 * Async host lookups, cached per exact query for as long as the document is
 * unchanged. Keyed on the immutable `Text` object, so any edit starts fresh
 * and a stale answer can never be served for a changed buffer.
 */
const lookupCache = new WeakMap<Text, Map<string, Promise<string[] | null>>>();

function cachedLookup(
  doc: Text,
  key: string,
  run: (() => Promise<string[]>) | null,
): Promise<string[] | null> {
  if (!run) return Promise.resolve(null);
  let byKey = lookupCache.get(doc);
  if (!byKey) {
    byKey = new Map();
    lookupCache.set(doc, byKey);
  }
  let pending = byKey.get(key);
  if (!pending) {
    pending = run().then(
      (ids) => ids,
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
  onPicked?: (view: EditorView) => void,
): Completion {
  return completionReactivates({
    label,
    detail,
    apply: (view, completion, from, to) => {
      writeAndAdvance(view, completion, from, to, value);
      onPicked?.(view);
    },
  });
}

function noteCompletions(
  role: Role,
  choices: readonly PickerOption[],
  opts: RelationshipCompletionOptions,
): Completion[] {
  const defaultHolderId = opts.defaultHolderId?.() ?? null;
  const currentNoteId = opts.currentNoteId?.() ?? null;
  return choices.slice(0, NOTE_LIMIT).map((option) => {
    const detail =
      role === 'holder' && option.id === defaultHolderId
        ? 'default holder'
        : option.id === currentNoteId
          ? 'this note'
          : undefined;
    return pick(noteRoleValue(option.id), option.label ?? option.path, detail, (view) => {
      rememberRecentNote(option.id);
      if (!shouldNotifyHolderChosen(role, defaultHolderId)) return;
      void Promise.resolve(opts.onHolderChosenWithoutDefault?.(option.id)).then(() => {
        if (!view.dom.isConnected) return;
        // A dialog may have taken focus (closing the list); pick up where we were.
        view.focus();
        startCompletion(view);
      });
    });
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
    const choices = noteChoices({
      role: slot.role,
      options: opts.noteOptions(),
      query,
      recentNoteIds: getRecentNoteIds(),
      currentNoteId: opts.currentNoteId?.() ?? null,
      defaultHolderId: opts.defaultHolderId?.() ?? null,
      restrictedIds: null,
    });
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
function narrowing(
  state: EditorState,
  directive: ParsedDirective,
  role: Role,
  actionKind: ActionKind | undefined,
  opts: RelationshipCompletionOptions,
): Promise<string[] | null> {
  if (actionKind !== 'remove') return Promise.resolve(null);
  const holder = noteIdOf(roleValue(directive, 'holder') ?? '');
  const doc = state.doc.toString();
  if (role === 'observer') {
    const option = roleValue(directive, 'option') || null;
    const lookup = opts.observerOptions;
    const run =
      holder && option && lookup
        ? () => lookup({ trackId: directive.trackId, holder, option, anchor: directive.from, doc })
        : null;
    return cachedLookup(state.doc, `observers:${directive.from}:${holder}:${option}`, run);
  }
  if (role === 'option') {
    const observer = noteIdOf(roleValue(directive, 'observer') ?? '');
    const lookup = opts.heldOptions;
    const run = lookup
      ? () => lookup({ trackId: directive.trackId, holder, observer, anchor: directive.from, doc })
      : null;
    return cachedLookup(state.doc, `held:${directive.from}:${holder}:${observer}`, run);
  }
  return Promise.resolve(null);
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

  const options =
    slot.role === 'holder' || slot.role === 'observer'
      ? noteCompletions(slot.role, narrowed, opts)
      : narrowed.map((o) => pick(o.id, o.label ?? o.path));

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
 * Tab or Enter on a typed query picks a real match without waiting on the
 * popup: the highlighted one when the list is open, otherwise the top match
 * computed straight from the same source — so typing "spi" and pressing Tab
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
    if (!hit || hit.slot.value === '' || !roleHasChoices(hit.slot.role, hit.model.track)) {
      return false;
    }
    const opts = getOptions();
    const { query, choices } = baseChoices(state, hit, opts);
    if (!query) return false;

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
