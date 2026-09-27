/**
 * Owns the relationship-directive form popover: which directive (if any) is
 * open, the draft values being edited, positioning it against the block's
 * whole rect, and committing a Save as one transaction/undo step. Mounts
 * the presentational React form (`relationship-directive-form.tsx`) outside
 * `view.dom`, on `document.body`. No business logic here beyond wiring
 * editor state and host-supplied IO to pure helpers in
 * `relationship-directive-form-logic.ts`.
 */
import { createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import {
  MapMode,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
import {
  resolveTrack,
  noteIdOf,
  promptFor,
  setRoleValueChange,
  type DirectiveEdit,
  type ParsedDirective,
  type Role,
  type TrackLibrary,
} from '../../../../shared/relationships';
import type { PickerOption } from '../../searchable-picker';
import { computeCaretPlacement, type CaretPlacement } from '../../context-menu/caret-position';
import type { Rect } from '../../context-menu/submenu-position';
import { getCaretRect, type CaretRect } from './editor-context-menu';
import { getDirectiveRootElement } from './relationship-directives';
import {
  allowsCreateOption,
  buildInitialDraft,
  changedRoles,
  fieldKindFor,
  firstEmptyRole,
  formRoles,
  storedValueFor,
  validateFormField,
  type FieldKind,
} from './relationship-directive-form-logic';
import { directivesIn, parsedDirectivesField } from './parsed-directives';
import {
  RelationshipDirectiveForm,
  type RelationshipDirectiveFormFieldProps,
  type RelationshipDirectiveFormProps,
} from './relationship-directive-form';
import { getRecentNoteIds, rememberRecentNote } from './relationship-recent-notes';

export interface FormAnchor {
  /** The directive's `from` at the time the form was opened — mapped on every change. */
  anchor: number;
}

export const openFormEffect = StateEffect.define<FormAnchor>();
export const closeFormEffect = StateEffect.define<null>();

function directiveAt(state: EditorState, anchor: number): ParsedDirective | null {
  return directivesIn(state).find((d) => d.from === anchor) ?? null;
}

export const directiveFormStateField = StateField.define<FormAnchor | null>({
  create: () => null,
  update(value, tr) {
    let next = value;
    for (const effect of tr.effects) {
      if (effect.is(openFormEffect)) next = effect.value;
      else if (effect.is(closeFormEffect)) next = null;
    }

    if (next && tr.docChanged) {
      const mapped = tr.changes.mapPos(next.anchor, -1, MapMode.TrackDel);
      next = mapped === null ? null : { anchor: mapped };
    }

    if (next && !directiveAt(tr.state, next.anchor)) next = null;

    return next;
  },
});

/** Opens the form for the directive starting at `anchor`. Read-only callers should guard first. */
export function openDirectiveForm(view: EditorView, anchor: number): void {
  view.dispatch({ effects: openFormEffect.of({ anchor }) });
}

export function closeDirectiveForm(view: EditorView): void {
  view.dispatch({ effects: closeFormEffect.of(null) });
}

/**
 * Inserts a freshly-filled directive as one undo step and opens its form —
 * the insert and the form-open are one transaction, so there's nothing to
 * observe in between.
 */
export function insertDirective(view: EditorView, from: number, to: number, text: string): void {
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
    effects: openFormEffect.of({ anchor: from }),
    userEvent: 'input.directive',
    annotations: isolateHistory.of('full'),
  });
}

/**
 * The query the form sends to the host's `heldOptions` resolver: which
 * (track, holder, observer) ledger to fold, the directive's own anchor (to
 * exclude its own delta from the fold), and the buffer's current text (the
 * host has no other way to locate the directive — it never reads the
 * editor's state directly). `holder`/`observer` reflect the form's live
 * DRAFT, not the document — the whole point of one form per directive is
 * that its fields are edited together, before any of them are written.
 */
export interface HeldOptionsQuery {
  trackId: string;
  holder: string | null;
  observer: string | null;
  anchor: number;
  doc: string;
}

export interface ObserverOptionsQuery {
  trackId: string;
  holder: string;
  option: string;
  anchor: number;
  doc: string;
}

export interface RelationshipFormOptions {
  noteOptions: () => readonly PickerOption[];
  defaultHolderId?: () => string | null;
  currentNoteId?: () => string | null;
  onHolderChosenWithoutDefault?: (id: string) => void | Promise<void>;
  createOption?: (
    trackId: string,
    label: string,
    mutual: boolean,
  ) => Promise<{ key: string } | null>;
  heldOptions?: (q: HeldOptionsQuery) => Promise<string[]>;
  observerOptions?: (q: ObserverOptionsQuery) => Promise<string[]>;
}

export interface RelationshipFormHostContext extends RelationshipFormOptions {
  library: TrackLibrary;
  defaultReason: string;
}

/**
 * Every form host currently mounted on `document.body` (normally at most
 * one, but the editor can host several instances). Membership is
 * synchronous with `directiveFormStateField` closing — `unmount()` removes
 * a host here immediately, even though the actual DOM node removal is
 * deferred a microtask — so a check made right after a close (e.g. the
 * event editor's own Escape handler, in the same keydown) sees the form as
 * already closed.
 */
const openFormHosts = new Set<HTMLElement>();

/**
 * Whether a relationship directive form is currently open — used by hosts
 * (e.g. `EventEditorModal`'s document-level Escape listener) that must not
 * act on an event the form itself is already handling. With `target`
 * given, only reports open when `target` is actually inside one of the
 * open forms' hosts.
 */
export function isRelationshipFormOpen(target?: EventTarget | null): boolean {
  if (openFormHosts.size === 0) return false;
  if (target === undefined) return true;
  if (!(target instanceof Node)) return false;
  for (const host of openFormHosts) {
    if (host.contains(target)) return true;
  }
  return false;
}

class RelationshipDirectiveFormPlugin {
  private host: HTMLDivElement | null = null;
  private root: Root | null = null;

  /** Held reference to the form's own rendered root — measured for placement instead of `this.host` (the mounting host itself is `position: fixed` with a `position: fixed` child, so its own box collapses to 0). */
  private readonly formRef: { current: HTMLDivElement | null } = { current: null };

  /** The open directive's draft values, by role — reset whenever a different directive opens. */
  private draft: Partial<Record<Role, string>> = {};
  private draftAnchor: number | null = null;
  private inlineErrors: Partial<Record<Role, string>> = {};
  /** The role to focus, decided ONCE when this anchor opens (never recomputed while editing — the document's own tokens stay empty until Save, so re-deriving "first empty" on every keystroke would fight the user's own focus). */
  private focusRoleForOpen: Role | null = null;
  /**
   * Whether this anchor has completed its one-time hidden-measure-then-
   * reposition pass. Only a fresh open does that dance; every later
   * re-render (a keystroke, a picked option, an async loading state
   * resolving) repaints in place at the last known position instead —
   * toggling `visibility: hidden` on every keystroke would drop focus from
   * whichever field the user is typing into (a hidden element can't hold
   * focus), truncating input to a single character.
   */
  private opened = false;
  private lastStyle: React.CSSProperties | null = null;
  private lastMaxHeight: number | null = null;

  private heldOptionsToken = 0;
  private heldOptionsPendingKey: string | null = null;
  private heldOptionsCache: { key: string; keys: string[] | null } | null = null;

  private observerOptionsToken = 0;
  private observerOptionsPendingKey: string | null = null;
  private observerOptionsCache: { key: string; ids: string[] | null } | null = null;

  constructor(
    readonly view: EditorView,
    readonly getContext: () => RelationshipFormHostContext,
  ) {
    document.addEventListener('pointerdown', this.handleOutsidePointerDown);
    this.sync();
  }

  update(update: ViewUpdate): void {
    const before = update.startState.field(directiveFormStateField, false);
    const after = update.state.field(directiveFormStateField, false);
    if (update.docChanged) {
      this.heldOptionsCache = null;
      this.heldOptionsPendingKey = null;
      this.heldOptionsToken++;
      this.observerOptionsCache = null;
      this.observerOptionsPendingKey = null;
      this.observerOptionsToken++;
    }
    if (before !== after || update.docChanged || update.geometryChanged || update.viewportChanged) {
      this.sync();
    }
  }

  destroy(): void {
    document.removeEventListener('pointerdown', this.handleOutsidePointerDown);
    this.unmount();
  }

  private handleOutsidePointerDown = (e: PointerEvent): void => {
    if (!this.host) return;
    if (e.target instanceof Node && this.host.contains(e.target)) return;
    this.cancel();
  };

  private cancel(): void {
    closeDirectiveForm(this.view);
    this.view.focus();
  }

  private setDraft(role: Role, value: string): void {
    this.draft = { ...this.draft, [role]: value };
    if (this.inlineErrors[role]) {
      const next = { ...this.inlineErrors };
      delete next[role];
      this.inlineErrors = next;
    }
    this.sync();
  }

  private save(): void {
    const state = this.view.state.field(directiveFormStateField, false);
    if (!state) return;
    const directive = directiveAt(this.view.state, state.anchor);
    if (!directive) return;
    const ctx = this.getContext();

    const track = resolveTrack(directive.trackId, ctx.library);
    const stored: Partial<Record<Role, string>> = {};
    const errors: Partial<Record<Role, string>> = {};

    for (const role of formRoles(directive)) {
      const kind = fieldKindFor(role, track ?? null);
      const draftText = this.draft[role] ?? '';
      const result = validateFormField(kind, track ?? null, draftText);
      if (!result.ok) {
        errors[role] = result.message;
        continue;
      }
      stored[role] = storedValueFor(kind, result.value);
    }

    if (Object.keys(errors).length > 0) {
      this.inlineErrors = errors;
      this.sync();
      return;
    }

    const edits: DirectiveEdit[] = [];
    for (const role of changedRoles(directive, stored)) {
      if (role === 'holder' || role === 'observer')
        rememberRecentNote(noteIdOf(stored[role] ?? ''));
      const edit = setRoleValueChange(directive, role, stored[role] ?? '');
      if (edit) edits.push(edit);
    }

    if (edits.length > 0) {
      this.view.dispatch({
        changes: edits,
        userEvent: 'input.directive',
        annotations: isolateHistory.of('full'),
      });
    }
    closeDirectiveForm(this.view);
    this.view.focus();
  }

  private sync(): void {
    const state = this.view.state.field(directiveFormStateField, false);
    if (!state) {
      this.unmount();
      return;
    }

    const directive = directiveAt(this.view.state, state.anchor);
    if (!directive) {
      this.unmount();
      return;
    }

    if (this.draftAnchor !== state.anchor) {
      this.draft = buildInitialDraft(directive);
      this.draftAnchor = state.anchor;
      this.inlineErrors = {};
      const roles = formRoles(directive);
      this.focusRoleForOpen = firstEmptyRole(directive) ?? roles[0] ?? null;
      this.opened = false;
      this.lastStyle = null;
      this.lastMaxHeight = null;
    }

    if (!this.host) this.mount();
    this.render(state.anchor, directive);
  }

  private mount(): void {
    this.host = document.createElement('div');
    this.host.className = 'relationship-directive-form-host';
    document.body.appendChild(this.host);
    openFormHosts.add(this.host);
    this.root = createRoot(this.host);
  }

  private unmount(): void {
    if (!this.root) return;
    const root = this.root;
    const host = this.host;
    this.root = null;
    this.host = null;
    this.draftAnchor = null;
    this.opened = false;
    this.lastStyle = null;
    this.lastMaxHeight = null;
    if (host) openFormHosts.delete(host);
    queueMicrotask(() => {
      root.unmount();
      host?.remove();
    });
  }

  private heldOptionsFor(
    ctx: RelationshipFormHostContext,
    q: Omit<HeldOptionsQuery, 'doc'>,
  ): { keys: string[] | null; loading: boolean } {
    if (!ctx.heldOptions) return { keys: null, loading: false };
    const key = JSON.stringify(q);
    if (this.heldOptionsCache?.key === key)
      return { keys: this.heldOptionsCache.keys, loading: false };
    if (this.heldOptionsPendingKey !== key) {
      this.heldOptionsPendingKey = key;
      const token = ++this.heldOptionsToken;
      const doc = this.view.state.doc.toString();
      void ctx.heldOptions({ ...q, doc }).then(
        (keys) => {
          if (token !== this.heldOptionsToken) return;
          this.heldOptionsCache = { key, keys };
          if (this.heldOptionsPendingKey === key) this.heldOptionsPendingKey = null;
          this.sync();
        },
        () => {
          if (token !== this.heldOptionsToken) return;
          this.heldOptionsCache = { key, keys: null };
          if (this.heldOptionsPendingKey === key) this.heldOptionsPendingKey = null;
          this.sync();
        },
      );
    }
    return { keys: null, loading: true };
  }

  private observerOptionsFor(
    ctx: RelationshipFormHostContext,
    q: Omit<ObserverOptionsQuery, 'doc'>,
  ): { ids: string[] | null; loading: boolean } {
    if (!ctx.observerOptions) return { ids: null, loading: false };
    const key = JSON.stringify(q);
    if (this.observerOptionsCache?.key === key) {
      return { ids: this.observerOptionsCache.ids, loading: false };
    }
    if (this.observerOptionsPendingKey !== key) {
      this.observerOptionsPendingKey = key;
      const token = ++this.observerOptionsToken;
      const doc = this.view.state.doc.toString();
      void ctx.observerOptions({ ...q, doc }).then(
        (ids) => {
          if (token !== this.observerOptionsToken) return;
          this.observerOptionsCache = { key, ids };
          if (this.observerOptionsPendingKey === key) this.observerOptionsPendingKey = null;
          this.sync();
        },
        () => {
          if (token !== this.observerOptionsToken) return;
          this.observerOptionsCache = { key, ids: null };
          if (this.observerOptionsPendingKey === key) this.observerOptionsPendingKey = null;
          this.sync();
        },
      );
    }
    return { ids: null, loading: true };
  }

  private fieldProps(
    directive: ParsedDirective,
    role: Role,
    ctx: RelationshipFormHostContext,
  ): RelationshipDirectiveFormFieldProps {
    const track = resolveTrack(directive.trackId, ctx.library) ?? null;
    const action = track?.action(directive.actionKey);
    const kind: FieldKind = fieldKindFor(role, track);
    const value = this.draft[role] ?? '';
    const prompt = action ? promptFor(role, action.template) : `choose ${role}`;

    const holderDraft = noteIdOf(this.draft.holder ?? '') ?? (this.draft.holder || null);
    const observerDraft = noteIdOf(this.draft.observer ?? '') ?? (this.draft.observer || null);

    const { keys: heldOptionKeys, loading: heldOptionsLoading } =
      role === 'option' && action?.kind === 'remove'
        ? this.heldOptionsFor(ctx, {
            trackId: directive.trackId,
            holder: holderDraft,
            observer: observerDraft,
            anchor: directive.from,
          })
        : { keys: null, loading: false };

    const optionDraft = this.draft.option || null;
    const { ids: restrictedNoteIds, loading: restrictedNoteIdsLoading } =
      role === 'observer' && action?.kind === 'remove' && holderDraft && optionDraft
        ? this.observerOptionsFor(ctx, {
            trackId: directive.trackId,
            holder: holderDraft,
            option: optionDraft,
            anchor: directive.from,
          })
        : { ids: null, loading: false };

    return {
      role,
      kind,
      value,
      prompt,
      error: this.inlineErrors[role] ?? null,
      track,
      trackId: directive.trackId,
      defaultReason: ctx.defaultReason,
      noteOptions: ctx.noteOptions(),
      recentNoteIds: getRecentNoteIds(),
      defaultHolderId: ctx.defaultHolderId?.() ?? null,
      currentNoteId: ctx.currentNoteId?.() ?? null,
      heldOptionKeys,
      heldOptionsLoading,
      restrictedNoteIds,
      restrictedNoteIdsLoading,
      onHolderChosenWithoutDefault: ctx.onHolderChosenWithoutDefault,
      createOption: allowsCreateOption(action?.kind) ? ctx.createOption : undefined,
      onChange: (v: string) => this.setDraft(role, v),
    };
  }

  /**
   * On a fresh open: renders once hidden to get the form's real dimensions,
   * then repositions and re-renders visible (deferred — `computePlacement`
   * needs real layout, and `EditorView.coordsAtPos` throws if called
   * synchronously inside a CodeMirror update).
   *
   * On every later re-render for the SAME anchor (a keystroke, a picked
   * option, a loading state resolving): repaints in place at the last
   * computed position — see `opened`'s doc comment for why this must never
   * repeat the hidden pass.
   */
  private render(anchor: number, directive: ParsedDirective): void {
    if (!this.root) return;
    const ctx = this.getContext();
    const roles = formRoles(directive);
    const fields = roles.map((role) => this.fieldProps(directive, role, ctx));

    const base: Omit<RelationshipDirectiveFormProps, 'style' | 'maxHeight' | 'visible'> = {
      anchor,
      fields,
      focusRole: this.focusRoleForOpen,
      formRef: this.formRef,
      onSave: () => this.save(),
      onCancel: () => this.cancel(),
    };

    if (!this.opened) {
      this.paint(base, { visibility: 'hidden', left: 0, top: 0 }, null, false);
      queueMicrotask(() => this.reposition(anchor, base));
      return;
    }

    this.paint(
      base,
      this.lastStyle ?? { visibility: 'hidden', left: 0, top: 0 },
      this.lastMaxHeight,
      true,
    );
  }

  private reposition(
    anchor: number,
    base: Omit<RelationshipDirectiveFormProps, 'style' | 'maxHeight' | 'visible'>,
  ): void {
    if (!this.root || !this.host) return;
    const current = this.view.state.field(directiveFormStateField, false);
    if (!current || current.anchor !== anchor) return;

    const placement = this.computePlacement(anchor);
    if (!placement) return;
    const style: React.CSSProperties = {
      left: placement.left,
      visibility: 'visible',
      ...(placement.side === 'below'
        ? { top: placement.top as number }
        : { bottom: placement.bottom as number }),
    };
    this.opened = true;
    this.lastStyle = style;
    this.lastMaxHeight = placement.maxHeight;
    this.paint(base, style, placement.maxHeight, true);
  }

  private paint(
    base: Omit<RelationshipDirectiveFormProps, 'style' | 'maxHeight' | 'visible'>,
    style: React.CSSProperties,
    maxHeight: number | null,
    visible: boolean,
  ): void {
    if (!this.root) return;
    const el: ReactElement = createElement(RelationshipDirectiveForm, {
      ...base,
      style,
      maxHeight,
      visible,
    });
    this.root.render(el);
  }

  /**
   * Anchors to the WHOLE block's rect: the widget's own held root element
   * (`getDirectiveRootElement`) when mounted, falling back to the union of
   * `coordsAtPos` at the directive's `from`/`to` — never an inner blank
   * element. Placement itself reuses `computeCaretPlacement` (prefer
   * below, flip above, always fully on screen) — the form's own
   * `formRef`-measured size is what's fit against the viewport.
   */
  private computePlacement(anchor: number): CaretPlacement | null {
    const directive = directiveAt(this.view.state, anchor);
    if (!directive) return null;

    const rootEl = getDirectiveRootElement(this.view, anchor);
    const caretRect: CaretRect | null = rootEl
      ? rootEl.getBoundingClientRect()
      : this.unionRect(anchor, directive.to);
    if (!caretRect) return null;
    // `caretRect` may be a real `DOMRect` (from `getBoundingClientRect()`),
    // whose `left`/`top`/`right`/`bottom` are prototype accessors, not own
    // enumerable properties — a `{ ...caretRect }` spread silently drops
    // them. Read each one explicitly instead.
    const rect: Rect = {
      left: caretRect.left,
      top: caretRect.top,
      right: caretRect.right,
      bottom: caretRect.bottom,
      width: caretRect.right - caretRect.left,
      height: caretRect.bottom - caretRect.top,
    };

    const formEl = this.formRef.current;
    const size = { width: formEl?.offsetWidth || 320, height: formEl?.offsetHeight || 160 };
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    return computeCaretPlacement(rect, size, viewport, 'below');
  }

  private unionRect(from: number, to: number): CaretRect | null {
    const a = getCaretRect(this.view, from);
    const b = getCaretRect(this.view, to);
    if (!a && !b) return null;
    if (!a) return b;
    if (!b) return a;
    return {
      left: Math.min(a.left, b.left),
      right: Math.max(a.right, b.right),
      top: Math.min(a.top, b.top),
      bottom: Math.max(a.bottom, b.bottom),
    };
  }
}

/**
 * The form's rendering extension. Include alongside `relationshipDirectives()`
 * in live mode; omit in source mode and in read-only editors (the form never
 * opens there, since `relationshipDirectives()` never dispatches
 * `openFormEffect` when read-only).
 */
export function relationshipDirectiveForm(
  getContext: () => RelationshipFormHostContext,
): Extension {
  return [
    parsedDirectivesField,
    directiveFormStateField,
    ViewPlugin.define((view) => new RelationshipDirectiveFormPlugin(view, getContext)),
  ];
}
