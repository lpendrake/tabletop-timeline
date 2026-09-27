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
import { Prec, type Extension, type Text } from '@codemirror/state';
import { keymap, type Command, type EditorView } from '@codemirror/view';
import {
  noteIdOf,
  noteRoleValue,
  roleValue,
  type ParsedDirective,
  type Role,
} from '../../../../shared/relationships';
import { UNKNOWN_ENTITY_LABEL } from '../../../../shared/entity-labels';
import type { PickerOption } from '../../searchable-picker';
import {
  completionReactivates,
  completionSources,
  editorAutocompletion,
} from './editor-completions';
import { directivesIn } from './parsed-directives';
import {
  adjacentSlot,
  directiveSlots,
  roleHasChoices,
  valueDisplay,
} from './relationship-directive-layout';
import { liveSlotAt, type DirectiveModel } from './relationship-directives';
import { entityLabelMapField } from './wiki-links';
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
 * Writes `value` into the blank at `from`–`to` and moves the caret to the
 * end of the next blank (or just past the directive after the last one), as
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
  const caret = next ? next.to : (directive?.to ?? end);
  view.dispatch({
    changes,
    selection: { anchor: caret },
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

function createCompletion(
  directive: ParsedDirective,
  query: string,
  mutual: boolean,
  opts: RelationshipCompletionOptions,
): Completion {
  const label = query.trim();
  return completionReactivates({
    label: mutual ? `Create "${label}" (symmetrical)` : `Create "${label}"`,
    apply: (view, completion) => {
      const { ordinal, trackId } = directive;
      void opts.createOption!(trackId, label, mutual).then((created) => {
        if (!created || !view.dom.isConnected) return;
        // The document may have moved on while the host was creating it:
        // find the same directive's tag blank again rather than trusting old positions.
        const current = directivesIn(view.state).find(
          (d) => d.ordinal === ordinal && d.trackId === trackId,
        );
        const slot = current ? directiveSlots(current).find((s) => s.role === 'option') : null;
        if (slot) writeAndAdvance(view, completion, slot.from, slot.to, created.key);
      });
    },
  });
}

async function completeBlank(
  context: CompletionContext,
  getOptions: () => RelationshipCompletionOptions,
): Promise<CompletionResult | null> {
  const { state } = context;
  const hit = liveSlotAt(state, context.pos);
  if (!hit || !hit.model.track) return null;
  const { directive, slot, model } = hit;
  const track = model.track!;
  if (!roleHasChoices(slot.role, track)) return null;

  const display = displayOf(model, slot.role, slot.value, state);
  const query = display.kind === 'text' ? slot.value : '';
  const opts = getOptions();
  const action = track.action(directive.actionKey);
  let options: Completion[] = [];

  if (slot.role === 'holder' || slot.role === 'observer') {
    const holder = noteIdOf(roleValue(directive, 'holder') ?? '');
    const option = roleValue(directive, 'option') || null;
    const restrict =
      slot.role === 'observer' &&
      action?.kind === 'remove' &&
      holder &&
      option &&
      opts.observerOptions
        ? () =>
            opts.observerOptions!({
              trackId: directive.trackId,
              holder,
              option,
              anchor: directive.from,
              doc: state.doc.toString(),
            })
        : null;
    const restrictedIds = await cachedLookup(
      state.doc,
      `observers:${directive.from}:${holder}:${option}`,
      restrict,
    );
    const choices = noteChoices({
      role: slot.role,
      options: opts.noteOptions(),
      query,
      recentNoteIds: getRecentNoteIds(),
      currentNoteId: opts.currentNoteId?.() ?? null,
      defaultHolderId: opts.defaultHolderId?.() ?? null,
      restrictedIds,
    });
    options = noteCompletions(slot.role, choices, opts);
  } else if (slot.role === 'option' && track.kind === 'categorical') {
    const holder = noteIdOf(roleValue(directive, 'holder') ?? '');
    const observer = noteIdOf(roleValue(directive, 'observer') ?? '');
    const lookup =
      action?.kind === 'remove' && opts.heldOptions
        ? () =>
            opts.heldOptions!({
              trackId: directive.trackId,
              holder,
              observer,
              anchor: directive.from,
              doc: state.doc.toString(),
            })
        : null;
    const held = await cachedLookup(
      state.doc,
      `held:${directive.from}:${holder}:${observer}`,
      lookup,
    );
    const all: PickerOption[] = track.options.map((o) => ({
      id: o.key,
      path: o.label,
      label: o.label,
    }));
    const ranked = rankLabelled(filterHeldOptions(all, held), query);
    options = ranked.map((o) => pick(o.id, o.label ?? o.path));
    if (
      allowsCreateOption(action?.kind) &&
      opts.createOption &&
      shouldOfferCreateOption(query, ranked)
    ) {
      options.push(createCompletion(directive, query, false, opts));
      options.push(createCompletion(directive, query, true, opts));
    }
  } else if (slot.role === 'value' && track.kind === 'ordinal') {
    const rungs: PickerOption[] = track.rungs.map((r) => ({
      id: r.key,
      path: r.label,
      label: r.label,
    }));
    options = rankLabelled(rungs, query).map((o) => pick(o.id, o.label ?? o.path));
  }

  if (context.aborted || options.length === 0) return null;
  return { from: slot.from, to: slot.to, options, filter: false };
}

/** Whether a blank holds typed text (a query) for a role that has choices. */
function hasTypedQuery(state: EditorView['state'], pos: number): boolean {
  const hit = liveSlotAt(state, pos);
  if (!hit || hit.slot.value === '' || !roleHasChoices(hit.slot.role, hit.model.track))
    return false;
  return displayOf(hit.model, hit.slot.role, hit.slot.value, state).kind === 'text';
}

function displayOf(model: DirectiveModel, role: Role, value: string, state: EditorView['state']) {
  const labels = state.field(entityLabelMapField, false) ?? new Map<string, string>();
  return valueDisplay(role, value, model.track, (id) => labels.get(id) ?? UNKNOWN_ENTITY_LABEL);
}

/**
 * Tab or Enter on a typed query picks a choice without waiting on the popup:
 * the highlighted one when the list is open and takes the key, otherwise the
 * top match, computed straight from the same source. So typing "spi" and
 * pressing Tab always fills Spire Watch, however fast it's typed.
 */
function makeAcceptTypedQuery(getOptions: () => RelationshipCompletionOptions): Command {
  return (view) => {
    const pos = view.state.selection.main.head;
    if (!view.state.selection.main.empty || !hasTypedQuery(view.state, pos)) return false;
    if (completionStatus(view.state) === 'active' && selectedCompletion(view.state)) {
      if (acceptCompletion(view)) return true;
    }
    const doc = view.state.doc;
    void completeBlank(new Context(view.state, pos, true), getOptions).then((result) => {
      const top = result?.options[0];
      // Drop the answer if the buffer changed while it was being worked out.
      if (!top || view.state.doc !== doc || typeof top.apply !== 'function') return;
      top.apply(view, top, result.from, result.to ?? result.from);
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
    // Ahead of the directive keymap's own Tab/Enter (which move between blanks).
    Prec.highest(
      keymap.of([
        { key: 'Tab', run: acceptTyped },
        { key: 'Enter', run: acceptTyped },
      ]),
    ),
  ];
}
