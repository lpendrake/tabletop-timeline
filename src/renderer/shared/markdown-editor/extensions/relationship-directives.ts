/**
 * Relationship directives (`{{trackId.action ...}}`) as live text. The
 * document stays the only place a directive's values live: each blank is the
 * real `{role:value}` text, highlighted, and the caret goes into it like any
 * other text. Everything around the blanks — the envelope, the template
 * wording, the `{role:` / `}` delimiters — is decorated (a chip, muted
 * wording, hidden delimiters), treated as atomic, and protected by a
 * transaction filter so no keystroke can break the syntax.
 *
 * Choices for a blank (notes, tags, rungs) come from
 * `relationship-directive-completions.ts` through the editor's shared
 * autocompletion; this file only opens that list when the caret arrives in
 * a blank. See `AGENTS.md` in this directory.
 */
import {
  EditorSelection,
  EditorState,
  Facet,
  MapMode,
  Prec,
  StateEffect,
  StateField,
  Transaction,
  type ChangeSpec,
  type Extension,
  type Range,
  type RangeSet,
  type TransactionSpec,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  type Command,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { isolateHistory } from '@codemirror/commands';
import { closeCompletion, completionStatus, startCompletion } from '@codemirror/autocomplete';
import {
  interpretDirective,
  resolveTrack,
  promptFor,
  noteIdOf,
  parseDirectives,
  sanitiseValue,
  EMPTY_TRACK_LIBRARY,
  NOTE_DEFAULT_REASON,
  type DirectiveProblem,
  type InterpretedDirective,
  type ParsedDirective,
  type ResolvedTrack,
  type TrackLibrary,
} from '../../../../shared/relationships';
import { UNKNOWN_ENTITY_LABEL } from '../../../../shared/entity-labels';
import { entityLabelMapField, setEntityLabels } from './wiki-links';
import { parsedDirectivesField, directivesIn } from './parsed-directives';
import {
  adjacentSlot,
  classifyChange,
  directiveLayout,
  firstEditSlot,
  nearestSlot,
  roleHasChoices,
  slotAt,
  valueDisplay,
  type DirectiveLayout,
  type SlotHit,
  type ValueDisplay,
  type ValueSlot,
} from './relationship-directive-layout';
import { stepAmount, stepNumericValue, stepRung } from './relationship-value-logic';

export interface RelationshipDirectivesConfig {
  readOnly?: boolean;
  onOpenNote?: (id: string) => void;
  /**
   * Whether this document is a note (undated) or an event. A note has no
   * order, so Change/Shift (`adjust`) and Remove are rejected there — see
   * `src/shared/relationships/AGENTS.md`'s notes-vs-events invariant.
   * Required — every host must say which it is explicitly.
   */
  place: 'note' | 'event';
}

interface DirectiveContext {
  library: TrackLibrary;
  defaultReason: string;
}

const DEFAULT_CONTEXT: DirectiveContext = {
  library: EMPTY_TRACK_LIBRARY,
  defaultReason: NOTE_DEFAULT_REASON,
};

/** Dispatch to push the resolved track library and the host's default reason into the editor. */
export const setDirectiveContext = StateEffect.define<DirectiveContext>();

export const directiveContextField = StateField.define<DirectiveContext>({
  create: () => DEFAULT_CONTEXT,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setDirectiveContext)) return e.value;
    }
    return value;
  },
});

/**
 * Which outline class (if any) a directive gets from its interpreted status:
 * unfinished (an empty required blank) → warning, invalid → danger, a
 * complete valid directive → none.
 */
export function directiveBorderClass(status: InterpretedDirective['status']): string | null {
  if (status === 'unfinished') return 'cm-directive-unfinished';
  if (status === 'invalid') return 'cm-directive-error';
  return null;
}

// ---------------------------------------------------------------------------
// Show source: Mod-/ inside a directive shows its raw text until the caret
// leaves it. A revealed directive is plain, unprotected text.
// ---------------------------------------------------------------------------

const setRevealed = StateEffect.define<number | null>();

const revealedField = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    let next = value;
    for (const e of tr.effects) if (e.is(setRevealed)) next = e.value;
    if (next === null) return null;
    if (tr.docChanged) {
      const mapped = tr.changes.mapPos(next, 1, MapMode.TrackDel);
      if (mapped === null) return null;
      next = mapped;
    }
    const directive = directivesIn(tr.state).find((d) => d.from === next);
    if (!directive) return null;
    const head = tr.state.selection.main.head;
    if (head < directive.from || head > directive.to) return null;
    return next;
  },
});

// ---------------------------------------------------------------------------
// The per-document model: every directive, interpreted, with its layout.
// ---------------------------------------------------------------------------

export interface DirectiveModel {
  directive: ParsedDirective;
  layout: DirectiveLayout;
  track: ResolvedTrack | null;
  status: InterpretedDirective['status'];
  problems: DirectiveProblem[];
  /**
   * Rendered as live blanks and protected. False for an unknown track or
   * action (shown as raw text so it can be fixed) and for a revealed one.
   */
  live: boolean;
  /** Why a non-live directive can't render (unknown track/action), if that's the reason. */
  blockingMessage: string | null;
}

interface DirectiveModelState {
  models: DirectiveModel[];
  decorations: DecorationSet;
  atomic: RangeSet<Decoration>;
}

function buildModels(state: EditorState, place: 'note' | 'event'): DirectiveModel[] {
  const { library } = state.field(directiveContextField);
  const revealed = state.field(revealedField, false) ?? null;
  return directivesIn(state).map((directive) => {
    const track = resolveTrack(directive.trackId, library);
    const interpreted = interpretDirective(directive, {
      resolveTrack: (id) => resolveTrack(id, library),
      undated: place === 'note',
    });
    const problems = interpreted.status === 'invalid' ? interpreted.problems : [];
    const blocking = problems.find(
      (p) => p.code === 'unknown-track' || p.code === 'unknown-action',
    );
    return {
      directive,
      layout: directiveLayout(directive),
      track: track ?? null,
      status: interpreted.status,
      problems,
      live: !blocking && revealed !== directive.from,
      blockingMessage: blocking?.message ?? null,
    };
  });
}

function labelForNoteFrom(state: EditorState): (id: string) => string {
  const map = state.field(entityLabelMapField, false) ?? new Map<string, string>();
  return (id: string) => map.get(id) ?? UNKNOWN_ENTITY_LABEL;
}

function displayFor(model: DirectiveModel, slot: ValueSlot, state: EditorState): ValueDisplay {
  return valueDisplay(slot.role, slot.value, model.track, labelForNoteFrom(state));
}

class ChipWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly statusClass: string | null,
  ) {
    super();
  }
  override eq(other: ChipWidget): boolean {
    return other.text === this.text && other.statusClass === this.statusClass;
  }
  override toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = this.statusClass
      ? `cm-directive-chip cm-directive-chip-${this.statusClass.replace('cm-directive-', '')}`
      : 'cm-directive-chip';
    el.textContent = this.text;
    return el;
  }
  override ignoreEvent(): boolean {
    return false;
  }
}

class TextWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly className: string,
    readonly title: string | null,
  ) {
    super();
  }
  override eq(other: TextWidget): boolean {
    return (
      other.text === this.text && other.className === this.className && other.title === this.title
    );
  }
  override toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = this.className;
    el.textContent = this.text;
    if (this.title) el.title = this.title;
    return el;
  }
  override ignoreEvent(): boolean {
    return false;
  }
}

/** The hover cross that deletes the whole directive. Finds its directive through the live view, never a captured position. */
class CrossWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }
  override toDOM(view: EditorView): HTMLElement {
    const el = document.createElement('span');
    el.className = 'cm-directive-cross';
    el.setAttribute('aria-label', 'Remove relationship change');
    el.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (!el.isConnected) return;
      const pos = view.posAtDOM(el);
      const directive = directivesIn(view.state).find((d) => d.from <= pos && pos <= d.to);
      if (!directive) return;
      view.dispatch({
        changes: { from: directive.from, to: directive.to, insert: '' },
        userEvent: 'delete.directive',
      });
    });
    return el;
  }
  // The cross handles its own mousedown; CodeMirror must not move the caret for it.
  override ignoreEvent(): boolean {
    return true;
  }
}

const hidden = Decoration.replace({});
const wordingMark = Decoration.mark({ class: 'cm-directive-wording' });
const sourceMark = Decoration.mark({ class: 'cm-directive-source' });
const atomicMark = Decoration.mark({});

function chipText(model: DirectiveModel): string {
  const action = model.track?.action(model.directive.actionKey);
  return `${model.track?.name ?? model.directive.trackId} · ${action?.label ?? model.directive.actionKey}`;
}

function buildModelState(
  state: EditorState,
  config: RelationshipDirectivesConfig,
): DirectiveModelState {
  const models = buildModels(state, config.place);
  const { defaultReason } = state.field(directiveContextField);
  const editable = !state.readOnly && !config.readOnly;
  const decorations: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];

  for (const model of models) {
    const { directive, layout } = model;
    if (!model.live) {
      if (model.blockingMessage) {
        decorations.push(
          Decoration.mark({
            class: 'cm-directive cm-directive-error cm-directive-raw',
            attributes: { title: model.blockingMessage },
          }).range(directive.from, directive.to),
        );
      } else {
        decorations.push(sourceMark.range(directive.from, directive.to));
      }
      continue;
    }

    const statusClass = directiveBorderClass(model.status);
    decorations.push(
      Decoration.mark({
        class: statusClass ? `cm-directive ${statusClass}` : 'cm-directive',
      }).range(directive.from, directive.to),
    );
    decorations.push(
      Decoration.replace({ widget: new ChipWidget(chipText(model), statusClass) }).range(
        layout.envelope.from,
        layout.envelope.to,
      ),
    );
    for (const span of layout.wording) {
      if (span.to > span.from) decorations.push(wordingMark.range(span.from, span.to));
    }
    for (const span of layout.delimiters) decorations.push(hidden.range(span.from, span.to));
    decorations.push(
      (editable ? Decoration.replace({ widget: new CrossWidget() }) : hidden).range(
        layout.close.from,
        layout.close.to,
      ),
    );

    const template = model.track?.action(directive.actionKey)?.template ?? '';
    for (const slot of layout.slots) {
      const problem = model.problems.find((p) => p.role === slot.role);
      const display = displayFor(model, slot, state);
      if (display.kind === 'empty') {
        const isReason = slot.role === 'reason';
        const text = isReason ? defaultReason : promptFor(slot.role, template);
        const className = isReason
          ? 'cm-directive-placeholder cm-directive-placeholder-default'
          : 'cm-directive-placeholder cm-directive-placeholder-attention';
        decorations.push(
          Decoration.widget({
            widget: new TextWidget(text, className, null),
            side: 1,
          }).range(slot.from),
        );
        continue;
      }
      const classes = ['cm-directive-value', `cm-directive-value-role-${slot.role}`];
      if (display.kind === 'label' && display.noteId) classes.push('cm-directive-value-note');
      if (problem) classes.push('cm-directive-value-error');
      const className = classes.join(' ');
      const title = problem?.message ?? null;
      if (display.kind === 'label') {
        decorations.push(
          Decoration.replace({
            widget: new TextWidget(display.label, `${className} cm-directive-value-label`, title),
          }).range(slot.from, slot.to),
        );
        atomic.push(atomicMark.range(slot.from, slot.to));
      } else {
        decorations.push(
          Decoration.mark({
            class: className,
            attributes: title ? { title } : undefined,
          }).range(slot.from, slot.to),
        );
      }
    }
    for (const span of layout.structure) {
      if (span.to > span.from) atomic.push(atomicMark.range(span.from, span.to));
    }
  }

  return {
    models,
    decorations: Decoration.set(decorations, true),
    atomic: Decoration.set(atomic, true),
  };
}

/** Every directive currently rendered as live blanks (and so protected). */
export function liveDirectives(state: EditorState): ParsedDirective[] {
  return (state.field(modelStateField, false)?.models ?? [])
    .filter((m) => m.live)
    .map((m) => m.directive);
}

/** The live directive model containing `pos` (ends inclusive), if any. */
export function liveModelAt(state: EditorState, pos: number): DirectiveModel | null {
  const models = state.field(modelStateField, false)?.models ?? [];
  return models.find((m) => m.live && m.directive.from <= pos && pos <= m.directive.to) ?? null;
}

/** The live blank `pos` sits in (ends inclusive), with its directive's model. */
export function liveSlotAt(
  state: EditorState,
  pos: number,
): (SlotHit & { model: DirectiveModel }) | null {
  const model = liveModelAt(state, pos);
  if (!model) return null;
  const slot = slotAt(model.directive, pos);
  return slot ? { model, directive: model.directive, slot } : null;
}

/** The host's per-editor settings, readable from state by every piece below. */
const directiveConfig = Facet.define<RelationshipDirectivesConfig, RelationshipDirectivesConfig>({
  combine: (values) => values[0] ?? { place: 'event' },
});

const modelStateField = StateField.define<DirectiveModelState>({
  create: (state) => buildModelState(state, state.facet(directiveConfig)),
  update(value, tr) {
    const rebuild =
      tr.docChanged ||
      tr.startState.field(revealedField, false) !== tr.state.field(revealedField, false) ||
      tr.effects.some((e) => e.is(setDirectiveContext) || e.is(setEntityLabels));
    return rebuild ? buildModelState(tr.state, tr.state.facet(directiveConfig)) : value;
  },
  provide: (f) => [
    EditorView.decorations.from(f, (v) => v.decorations),
    EditorView.atomicRanges.of((view) => view.state.field(f).atomic),
  ],
});

// ---------------------------------------------------------------------------
// The guard: typed, pasted, dropped or deleted text may only change a value,
// or whole directives. Anything touching structure is dropped.
// ---------------------------------------------------------------------------

function isGuardedEdit(tr: Transaction): boolean {
  return tr.isUserEvent('input') || tr.isUserEvent('delete') || tr.isUserEvent('move');
}

/**
 * Pure-ish decision for one transaction, exported for tests: returns the
 * transaction unchanged, a rewritten spec (values sanitised, a picked
 * note/tag/rung replaced as a whole when typed over), or `[]` to drop it.
 */
export function guardDirectiveEdit(tr: Transaction): Transaction | TransactionSpec | readonly [] {
  if (!tr.docChanged || !isGuardedEdit(tr)) return tr;
  const state = tr.startState;
  const live = liveDirectives(state);
  if (live.length === 0) return tr;

  let blocked = false;
  let rewritten = false;
  const changes: ChangeSpec[] = [];
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    const verdict = classifyChange(live, fromA, toA);
    const text = inserted.toString();
    if (verdict.kind === 'blocked') {
      blocked = true;
      return;
    }
    if (verdict.kind !== 'value') {
      changes.push({ from: fromA, to: toA, insert: text });
      return;
    }
    const { slot } = verdict;
    let from = fromA;
    let to = toA;
    const model = liveModelAt(state, slot.from);
    const coversSlot = fromA === slot.from && toA === slot.to;
    if (
      model &&
      text.length > 0 &&
      !coversSlot &&
      displayFor(model, slot, state).kind === 'label'
    ) {
      from = slot.from;
      to = slot.to;
      rewritten = true;
    }
    const clean = sanitiseValue(text);
    if (clean !== text) rewritten = true;
    changes.push({ from, to, insert: clean });
  });

  if (blocked) return [];
  if (!rewritten) return tr;

  const changeSet = state.changes(changes);
  return {
    changes: changeSet,
    selection: state.selection.map(changeSet, 1),
    effects: tr.effects,
    scrollIntoView: tr.scrollIntoView,
    annotations: [Transaction.userEvent.of(tr.annotation(Transaction.userEvent) ?? 'input')],
  };
}

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

function editable(view: EditorView, config: RelationshipDirectivesConfig): boolean {
  return !view.state.readOnly && !config.readOnly;
}

/** Moves the caret to `pos` inside a directive and opens that blank's choices. */
function moveToSlot(view: EditorView, pos: number): void {
  view.dispatch({
    selection: EditorSelection.cursor(pos),
    userEvent: 'select.directive',
    scrollIntoView: true,
  });
  const hit = liveSlotAt(view.state, pos);
  if (hit && roleHasChoices(hit.slot.role, hit.model.track)) startCompletion(view);
}

function makeNextBlankCommand(config: RelationshipDirectivesConfig, dir: 1 | -1): Command {
  return (view) => {
    if (!editable(view, config)) return false;
    const head = view.state.selection.main.head;
    const hit = liveSlotAt(view.state, head);
    if (!hit) return false;
    const next = adjacentSlot(hit.directive, head, dir);
    if (next) {
      moveToSlot(view, next.to);
    } else {
      closeCompletion(view);
      view.dispatch({
        selection: EditorSelection.cursor(dir === 1 ? hit.directive.to : hit.directive.from),
        userEvent: 'select.directive',
        scrollIntoView: true,
      });
    }
    return true;
  };
}

/** Alt-↑/↓ in an amount or value blank steps it by the track's step (or one rung). */
function makeStepCommand(config: RelationshipDirectivesConfig, dir: 1 | -1): Command {
  return (view) => {
    if (!editable(view, config)) return false;
    const hit = liveSlotAt(view.state, view.state.selection.main.head);
    const track = hit?.model.track;
    if (!hit || !track) return false;
    let next: string | null = null;
    if (hit.slot.role === 'amount') next = stepAmount(hit.slot.value || '0', track, dir);
    else if (hit.slot.role === 'value' && track.kind === 'numeric') {
      next = stepNumericValue(hit.slot.value || '0', track, dir);
    } else if (hit.slot.role === 'value' && track.kind === 'ordinal') {
      next = stepRung(hit.slot.value, track, dir);
    }
    if (next === null) return false;
    view.dispatch({
      changes: { from: hit.slot.from, to: hit.slot.to, insert: next },
      selection: EditorSelection.cursor(hit.slot.from + next.length),
      userEvent: 'input.directive.step',
    });
    return true;
  };
}

/**
 * Backspace right after a directive, or Delete right before it, selects it
 * on the first press; pressing again (selection now covers exactly the
 * directive) deletes it in one transaction — one undo step either way.
 */
function makeBoundaryCommand(
  config: RelationshipDirectivesConfig,
  kind: 'backspace' | 'delete',
): Command {
  return (view) => {
    if (!editable(view, config)) return false;
    const sel = view.state.selection.main;
    const directives = liveDirectives(view.state);

    if (!sel.empty) {
      const covering = directives.find((d) => d.from === sel.from && d.to === sel.to);
      if (!covering) return false;
      view.dispatch({
        changes: { from: covering.from, to: covering.to, insert: '' },
        userEvent: 'delete.directive',
      });
      return true;
    }

    const target =
      kind === 'backspace'
        ? directives.find((d) => d.to === sel.head)
        : directives.find((d) => d.from === sel.head);
    if (!target) return false;
    view.dispatch({ selection: { anchor: target.from, head: target.to } });
    return true;
  };
}

/**
 * Home/End inside a blank go to that blank's start/end first; pressed again
 * at the edge, they fall through to the usual line start/end.
 */
function makeBlankEdgeCommand(
  config: RelationshipDirectivesConfig,
  edge: 'start' | 'end',
): Command {
  return (view) => {
    if (!editable(view, config)) return false;
    const sel = view.state.selection.main;
    if (!sel.empty) return false;
    const hit = liveSlotAt(view.state, sel.head);
    if (!hit) return false;
    const target = edge === 'start' ? hit.slot.from : hit.slot.to;
    if (target === sel.head) return false;
    view.dispatch({ selection: EditorSelection.cursor(target), userEvent: 'select' });
    return true;
  };
}

/** Mod-/ inside a directive toggles showing its raw source. */
const toggleSource: Command = (view) => {
  const head = view.state.selection.main.head;
  const directive = directivesIn(view.state).find((d) => d.from <= head && head <= d.to);
  if (!directive) return false;
  const current = view.state.field(revealedField, false) ?? null;
  view.dispatch({ effects: setRevealed.of(current === directive.from ? null : directive.from) });
  return true;
};

function directiveKeymap(config: RelationshipDirectivesConfig): Extension {
  const next = makeNextBlankCommand(config, 1);
  return Prec.high(
    keymap.of([
      { key: 'Tab', run: next, shift: makeNextBlankCommand(config, -1) },
      { key: 'Enter', run: next },
      { key: 'Alt-ArrowUp', run: makeStepCommand(config, 1) },
      { key: 'Alt-ArrowDown', run: makeStepCommand(config, -1) },
      { key: 'Backspace', run: makeBoundaryCommand(config, 'backspace') },
      { key: 'Delete', run: makeBoundaryCommand(config, 'delete') },
      { key: 'Home', run: makeBlankEdgeCommand(config, 'start') },
      { key: 'End', run: makeBlankEdgeCommand(config, 'end') },
      { key: 'Mod-/', run: toggleSource },
    ]),
  );
}

// ---------------------------------------------------------------------------
// Pointer
// ---------------------------------------------------------------------------

/** Where a click landed; falls back to the clicked element when there's no layout to measure. */
function clickPos(view: EditorView, event: MouseEvent, el: Element): number {
  try {
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos !== null) return pos;
  } catch {
    // No layout (e.g. a detached or unmeasured view).
  }
  return view.posAtDOM(el);
}

function directivePointer(config: RelationshipDirectivesConfig): Extension {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.button !== 0) return false;
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return false;

      const valueEl = target.closest('.cm-directive-value');
      if (event.ctrlKey || event.metaKey) {
        if (!valueEl) return false;
        const hit = liveSlotAt(view.state, view.posAtDOM(valueEl));
        const noteId = hit ? noteIdOf(hit.slot.value) : null;
        if (!noteId) return false;
        event.preventDefault();
        config.onOpenNote?.(noteId);
        return true;
      }

      if (!editable(view, config)) return false;
      // Typed text in a value is real text: CodeMirror places the caret in it.
      if (valueEl && !valueEl.classList.contains('cm-directive-value-label')) return false;

      // An empty blank's placeholder or a picked name is a widget. Its
      // coordinates sit next to hidden structure, which the atomic skip would
      // snap into the neighbouring blank — so resolve it by the widget's own
      // document position instead.
      const widgetEl = valueEl ?? target.closest('.cm-directive-placeholder');
      let slot: ValueSlot | null = null;
      if (widgetEl) {
        slot = liveSlotAt(view.state, view.posAtDOM(widgetEl))?.slot ?? null;
      } else {
        // A click anywhere else on a directive lands in its nearest blank.
        const blockEl = target.closest('.cm-directive, .cm-directive-chip');
        if (!blockEl) return false;
        const pos = clickPos(view, event, blockEl);
        const model = liveModelAt(view.state, pos);
        slot = model ? nearestSlot(model.directive, pos) : null;
      }
      if (!slot) return false;
      event.preventDefault();
      view.focus();
      view.dispatch({ selection: EditorSelection.cursor(slot.to), userEvent: 'select.pointer' });
      return true;
    },
  });
}

/**
 * Opens a blank's choices when the caret arrives in it by a click or a fresh
 * insert. (Tab/Enter open them directly; plain arrow keys don't, so moving
 * through a line never pops a list uninvited.)
 */
function openChoicesOnArrival(config: RelationshipDirectivesConfig): Extension {
  return ViewPlugin.fromClass(
    class {
      private destroyed = false;
      constructor(readonly view: EditorView) {}
      update(update: ViewUpdate) {
        if (!editable(update.view, config)) return;
        const arrived = update.transactions.some(
          (tr) => tr.isUserEvent('select.pointer') || tr.isUserEvent('input.directive.insert'),
        );
        if (!arrived) return;
        const hit = liveSlotAt(update.state, update.state.selection.main.head);
        if (!hit || !roleHasChoices(hit.slot.role, hit.model.track)) return;
        // Can't dispatch from inside an update; open it straight after.
        queueMicrotask(() => {
          if (this.destroyed || completionStatus(this.view.state) === 'active') return;
          startCompletion(this.view);
        });
      }
      destroy() {
        this.destroyed = true;
      }
    },
  );
}

/**
 * Inserts a freshly filled directive as one undo step with the caret in its
 * first empty blank, whose choices then open. A target inside an existing
 * directive moves to just after it — directives never nest.
 */
export function insertDirective(view: EditorView, from: number, to: number, text: string): void {
  const host = directivesIn(view.state).find(
    (d) => (d.from < from && from < d.to) || (d.from < to && to < d.to),
  );
  if (host) {
    from = host.to;
    to = host.to;
    text = ` ${text}`;
  }
  const probe = parseDirectives(text).directives[0];
  const slot = probe ? firstEditSlot(probe) : null;
  const caret = from + (slot ? slot.to : text.length);
  view.focus();
  view.dispatch({
    changes: { from, to, insert: text },
    selection: EditorSelection.cursor(caret),
    userEvent: 'input.directive.insert',
    annotations: isolateHistory.of('full'),
    scrollIntoView: true,
  });
}

const directiveTheme = EditorView.theme({
  '.cm-directive': {
    backgroundColor: 'var(--theme-directive-background)',
    borderRadius: '4px',
    padding: '2px 0',
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
  },
  '.cm-directive-raw': {
    outline: '1px solid var(--theme-danger)',
  },
  '.cm-directive-source': {
    backgroundColor: 'var(--theme-directive-background)',
    outline: '1px dashed var(--theme-directive-border)',
    borderRadius: '4px',
  },
  '.cm-directive-chip': {
    display: 'inline-block',
    fontSize: '0.75em',
    lineHeight: '1.5',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    padding: '0 5px',
    marginRight: '6px',
    borderRadius: '4px',
    border: '1px solid var(--theme-directive-border)',
    color: 'var(--theme-text-secondary)',
    cursor: 'pointer',
    verticalAlign: '0.1em',
  },
  '.cm-directive-chip-unfinished': { borderColor: 'var(--theme-warning)' },
  '.cm-directive-chip-error': { borderColor: 'var(--theme-danger)' },
  '.cm-directive-wording': {
    color: 'var(--theme-text-secondary)',
    cursor: 'pointer',
  },
  '.cm-directive-value': {
    backgroundColor: 'var(--theme-directive-value-highlight)',
    borderRadius: '3px',
    padding: '1px 3px',
  },
  '.cm-directive-value-note': {
    fontWeight: '600',
  },
  '.cm-directive-value-error': {
    textDecoration: 'underline wavy var(--theme-danger)',
    textUnderlineOffset: '4px',
  },
  '.cm-directive-placeholder': {
    fontStyle: 'italic',
    padding: '0 3px',
  },
  '.cm-directive-placeholder-attention': {
    color: 'var(--theme-warning)',
    border: '1px dashed var(--theme-warning)',
    borderRadius: '3px',
  },
  '.cm-directive-placeholder-default': {
    color: 'var(--theme-text-muted)',
  },
  '.cm-directive-cross': {
    display: 'inline-block',
    width: '14px',
    height: '14px',
    lineHeight: '14px',
    marginLeft: '4px',
    textAlign: 'center',
    borderRadius: '50%',
    backgroundColor: 'var(--theme-danger)',
    color: 'var(--theme-background)',
    fontSize: '10px',
    verticalAlign: '0.1em',
    cursor: 'pointer',
    opacity: '0',
  },
  '.cm-directive-cross::before': {
    content: '"\\00d7"',
  },
  '.cm-line:hover .cm-directive-cross': {
    opacity: '1',
  },
});

/**
 * Renders relationship directives as live blanks. Live-mode only — hosts
 * omit this extension in source mode (see `markdown-editor.tsx`).
 */
export function relationshipDirectives(config: RelationshipDirectivesConfig): Extension {
  const readOnly = Boolean(config.readOnly);
  return [
    directiveContextField,
    // Read-only here (labels are pushed by the host via `setEntityLabels`);
    // included so the label lookup resolves even without `wikiLinks()`.
    entityLabelMapField,
    parsedDirectivesField,
    revealedField,
    directiveConfig.of(config),
    modelStateField,
    directiveTheme,
    directivePointer(config),
    readOnly
      ? []
      : [
          EditorState.transactionFilter.of(guardDirectiveEdit),
          directiveKeymap(config),
          openChoicesOnArrival(config),
        ],
  ];
}
