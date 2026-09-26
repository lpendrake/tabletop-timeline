/**
 * Renders relationship directives (`{{trackId.action ...}}`) as distinct,
 * atomic, form-like blocks in live mode. See `AGENTS.md` in this directory
 * for why this extension uses `Decoration.replace` where `wiki-links.ts`
 * deliberately does not.
 *
 * Parsing, semantic resolution and the readable sentence are all owned by
 * `src/shared/relationships/` — this extension only renders what that module
 * computes and wires up click/keyboard/hover interaction. No IO, no re-parsing.
 */
import {
  Prec,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  keymap,
  type Command,
  type DecorationSet,
} from '@codemirror/view';
import {
  interpretDirective,
  readableParts,
  resolveTrack,
  EMPTY_TRACK_LIBRARY,
  NOTE_DEFAULT_REASON,
  type InterpretedDirective,
  type ParsedDirective,
  type ReadablePart,
  type Role,
  type TrackLibrary,
} from '../../../../shared/relationships';
import { UNKNOWN_ENTITY_LABEL } from '../../../../shared/entity-labels';
import { entityLabelMapField, setEntityLabels } from './wiki-links';
import { openDirectiveBubble } from './relationship-bubble-state';
import { firstOf } from './relationship-bubble-logic';
import { parsedDirectivesField, directivesIn } from './parsed-directives';
import { makePointerGuard } from './pointer-guard';

export interface RelationshipDirectivesConfig {
  readOnly?: boolean;
  onOpenNote?: (id: string) => void;
  /**
   * Whether this document is a note (undated) or an event. A note has no
   * order, so Change/Shift (`adjust`) and Remove are rejected there — see
   * `src/shared/relationships/AGENTS.md`'s notes-vs-events invariant.
   * Defaults to `'event'` (the permissive context) when omitted.
   */
  place?: 'note' | 'event';
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

const directiveContextField = StateField.define<DirectiveContext>({
  create: () => DEFAULT_CONTEXT,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setDirectiveContext)) return e.value;
    }
    return value;
  },
});

type DirectiveView =
  | { kind: 'error'; title: string; status: InterpretedDirective['status'] }
  | { kind: 'sentence'; parts: ReadablePart[]; status: InterpretedDirective['status'] };

/**
 * Which outline class (if any) a directive block gets, purely from its
 * interpreted status: unfinished (an empty required blank) gets the warning
 * outline, invalid (unknown track/action, or any value problem) gets the
 * danger outline, and a complete, valid directive keeps the default
 * `--theme-directive-border` outline (no extra class). Kept pure and
 * unit-tested — see `extensions/__tests__/relationship-directives.test.ts`.
 */
export function directiveBorderClass(status: InterpretedDirective['status']): string | null {
  if (status === 'unfinished') return 'cm-directive-unfinished';
  if (status === 'invalid') return 'cm-directive-error';
  return null;
}

type ValuePart = Extract<ReadablePart, { kind: 'value' }>;

/** Picks the field a click on the wording (or an Enter on a selected block) should target. */
export function firstEditRole(parts: ReadablePart[]): Role | null {
  const values = parts.filter((p): p is ValuePart => p.kind === 'value');
  return firstOf(values, (p) => p.empty)?.role ?? null;
}

/**
 * Pure hysteresis for the delete cross's end: switches only once the pointer
 * fraction (0 = block start, 1 = block end) is clearly past the middle
 * (60%/40%), otherwise keeps the previous end. Keeps the cross from
 * flickering when the pointer hovers near the block's horizontal center.
 */
export function crossEnd(fraction: number, previous: 'start' | 'end'): 'start' | 'end' {
  if (fraction <= 0.4) return 'start';
  if (fraction >= 0.6) return 'end';
  return previous;
}

/** Interprets a directive against the library and produces its display view. */
function buildDirectiveView(
  d: ParsedDirective,
  library: TrackLibrary,
  defaultReason: string,
  labelForNote: (id: string) => string,
  place: 'note' | 'event',
): DirectiveView {
  const track = resolveTrack(d.trackId, library);
  const interpreted = interpretDirective(d, {
    resolveTrack: (id) => resolveTrack(id, library),
    undated: place === 'note',
  });

  if (interpreted.status === 'invalid') {
    const blocking = interpreted.problems.find(
      (p) => p.code === 'unknown-track' || p.code === 'unknown-action',
    );
    if (blocking) return { kind: 'error', title: blocking.message, status: 'invalid' };
  }

  const problems = interpreted.status === 'invalid' ? interpreted.problems : [];
  const parts = readableParts(d, { track, labelForNote, defaultReason, problems });
  return { kind: 'sentence', parts, status: interpreted.status };
}

function labelForNoteFrom(state: EditorState): (id: string) => string {
  const map = state.field(entityLabelMapField, false) ?? new Map<string, string>();
  return (id: string) => map.get(id) ?? UNKNOWN_ENTITY_LABEL;
}

/**
 * Resolves the directive CURRENTLY at `root`'s document position, via
 * CodeMirror's own DOM→position mapping (`view.posAtDOM`) — never a
 * captured `from`/`to` number, and never a `data-*` attribute. This is
 * robust across CodeMirror reusing a widget's DOM node for a content-equal
 * rebuild (see `DirectiveWidget.eq`): `posAtDOM` always reflects the LIVE
 * view, regardless of which widget object happened to render that node. A
 * detached or repositioned-away root (stale — the doc changed since it was
 * built) resolves to `null` and every handler below just does nothing.
 */
function currentDirectiveAt(view: EditorView, root: HTMLElement): ParsedDirective | null {
  if (!root.isConnected) return null;
  let pos: number;
  try {
    pos = view.posAtDOM(root);
  } catch {
    return null;
  }
  return directivesIn(view.state).find((d) => d.from === pos) ?? null;
}

/**
 * Live registry of each currently-mounted directive block's blank spans, by
 * the directive's `from` and then by role — populated by `DirectiveWidget`
 * itself at `toDOM` time and cleared on `destroy`. This is what
 * `relationship-bubble-view-plugin.ts` reads to find a blank's rendered rect
 * for the fill-in bubble's tail: a direct reference to the actual span held
 * by its own widget instance, never a `querySelector`/`data-*` lookup (see
 * this file's own `currentDirectiveAt` and the module AGENTS.md for why
 * directive data is never read back from the DOM). Keyed by identity on
 * cleanup, so an old widget's `destroy` can never clobber a newer widget's
 * entry for the same (possibly reused) `from` position.
 *
 * Scoped per `EditorView` (outer `WeakMap`) because several editors can be
 * mounted at once over the SAME document (e.g. an editor modal and the
 * read-only preview behind it), and a directive at a given `from` can exist
 * identically in more than one of them. Without this scoping, a lookup from
 * one editor could return another editor's element (anchoring the bubble
 * tail in the wrong DOM tree), and one editor's widget `destroy()` could
 * race and clobber another editor's registration for the same `from`.
 */
const roleElementRegistry = new WeakMap<EditorView, Map<number, Map<Role, HTMLElement>>>();

/** The blank's rendered element for `role` on the directive at `from` within `view`, if currently mounted. */
export function getDirectiveRoleElement(
  view: EditorView,
  from: number,
  role: Role,
): HTMLElement | null {
  return roleElementRegistry.get(view)?.get(from)?.get(role) ?? null;
}

class DirectiveWidget extends WidgetType {
  private readonly roleElements = new Map<Role, HTMLElement>();
  /**
   * Captured in `toDOM` so `destroy` — which CodeMirror calls without
   * passing the view — can identity-check and clean up this widget's own
   * entry in `roleElementRegistry` for the correct view.
   */
  private mountedView: EditorView | null = null;

  constructor(
    readonly directive: ParsedDirective,
    readonly built: DirectiveView,
    readonly readOnly: boolean,
    readonly config: RelationshipDirectivesConfig,
  ) {
    super();
  }

  override eq(other: DirectiveWidget): boolean {
    return (
      this.directive.from === other.directive.from &&
      this.directive.to === other.directive.to &&
      this.directive.raw === other.directive.raw &&
      this.readOnly === other.readOnly &&
      JSON.stringify(this.built) === JSON.stringify(other.built)
    );
  }

  private openField(view: EditorView, root: HTMLElement, role: Role): void {
    const directive = currentDirectiveAt(view, root);
    if (!directive) return;
    openDirectiveBubble(view, directive.from, role);
  }

  override toDOM(view: EditorView): HTMLElement {
    const root = document.createElement('span');
    const borderClass = directiveBorderClass(this.built.status);
    root.className = borderClass ? `cm-directive ${borderClass}` : 'cm-directive';

    if (this.built.kind === 'error') {
      root.title = this.built.title;
      root.textContent = this.directive.raw;
    } else {
      for (const part of this.built.parts) {
        if (part.kind === 'text') {
          root.appendChild(document.createTextNode(part.text));
          continue;
        }
        root.appendChild(this.buildValueSpan(part, view, root));
      }
    }

    if (!this.readOnly) {
      const cross = document.createElement('span');
      cross.className = 'cm-directive-cross cm-directive-cross-end';
      cross.setAttribute('aria-hidden', 'true');
      // The '×' glyph is drawn via CSS `content` (see `directiveTheme`), not
      // as text content, so it never appears in the block's `textContent` —
      // that must stay exactly the readable sentence. `crossSide` below is
      // ephemeral hover UI state held in this closure, written out only as a
      // CSS class on `cross` — never read back from the DOM.
      let crossSide: 'start' | 'end' = 'end';
      const onMove = (event: MouseEvent) => {
        const rects = Array.from(root.getClientRects());
        const rect =
          rects.find((r) => event.clientY >= r.top && event.clientY <= r.bottom) ??
          rects[rects.length - 1];
        if (!rect || rect.width === 0) return;

        const fraction = (event.clientX - rect.left) / rect.width;
        const next = crossEnd(fraction, crossSide);
        if (next === crossSide) return;

        crossSide = next;
        cross.classList.toggle('cm-directive-cross-start', next === 'start');
        cross.classList.toggle('cm-directive-cross-end', next === 'end');
      };
      root.addEventListener('mousemove', onMove);
      root.addEventListener('mouseleave', () => {
        crossSide = 'end';
        cross.classList.remove('cm-directive-cross-start');
        cross.classList.add('cm-directive-cross-end');
      });
      cross.addEventListener('click', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const directive = currentDirectiveAt(view, root);
        if (!directive) return;
        view.dispatch({
          changes: { from: directive.from, to: directive.to, insert: '' },
          userEvent: 'delete.directive',
        });
      });
      root.appendChild(cross);
    }

    // Wording click: opens the first blank to edit. Value/cross clicks
    // above call stopPropagation so this only fires for genuine wording
    // clicks (or a click anywhere else in the block when it has no values).
    root.addEventListener('click', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (this.readOnly || this.config.readOnly) return;
      if (this.built.kind !== 'sentence') return;
      const role = firstEditRole(this.built.parts);
      if (role) this.openField(view, root, role);
    });

    root.addEventListener('contextmenu', (event) => {
      const directive = currentDirectiveAt(view, root);
      if (!directive) return;
      event.preventDefault();
      view.dispatch({ selection: { anchor: directive.from, head: directive.to } });
    });

    if (this.built.kind === 'sentence') {
      this.mountedView = view;
      let byFrom = roleElementRegistry.get(view);
      if (!byFrom) {
        byFrom = new Map<number, Map<Role, HTMLElement>>();
        roleElementRegistry.set(view, byFrom);
      }
      byFrom.set(this.directive.from, this.roleElements);
    }

    return root;
  }

  override destroy(): void {
    if (!this.mountedView) return;
    const byFrom = roleElementRegistry.get(this.mountedView);
    const current = byFrom?.get(this.directive.from);
    if (current === this.roleElements) byFrom?.delete(this.directive.from);
  }

  private buildValueSpan(part: ValuePart, view: EditorView, root: HTMLElement): HTMLElement {
    const span = document.createElement('span');
    const classes = ['cm-directive-value', `cm-directive-value-role-${part.role}`];
    if (part.problem) {
      classes.push('cm-directive-value-error');
      span.title = part.problem.message;
    } else if (part.empty) {
      classes.push('cm-directive-value-attention');
    }
    if ((part.role === 'holder' || part.role === 'observer') && part.noteId) {
      classes.push('cm-directive-value-note');
    }
    span.className = classes.join(' ');
    span.textContent = part.display;
    this.roleElements.set(part.role, span);

    span.addEventListener('click', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const modified = event.ctrlKey || event.metaKey;
      if (modified && part.noteId) {
        this.config.onOpenNote?.(part.noteId);
        return;
      }
      if (modified || this.readOnly || this.config.readOnly) return;
      this.openField(view, root, part.role);
    });

    return span;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

function buildDecorations(state: EditorState, config: RelationshipDirectivesConfig): DecorationSet {
  const { library, defaultReason } = state.field(directiveContextField);
  const labelForNote = labelForNoteFrom(state);
  const readOnly = Boolean(state.readOnly) || Boolean(config.readOnly);
  const place = config.place ?? 'event';

  const builder = new RangeSetBuilder<Decoration>();
  for (const d of directivesIn(state)) {
    const built = buildDirectiveView(d, library, defaultReason, labelForNote, place);
    builder.add(
      d.from,
      d.to,
      Decoration.replace({ widget: new DirectiveWidget(d, built, readOnly, config) }),
    );
  }
  return builder.finish();
}

/**
 * Backspace right after a block, or Delete right before it, selects the
 * block on the first press; pressing again (selection now covers exactly
 * the block) deletes it in one transaction — one undo step either way.
 */
function makeBoundaryCommand(kind: 'backspace' | 'delete'): Command {
  return (view) => {
    if (view.state.readOnly) return false;
    const sel = view.state.selection.main;
    const directives = directivesIn(view.state);

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

function makeDirectiveDeleteKeymap(): Extension {
  return Prec.high(
    keymap.of([
      { key: 'Backspace', run: makeBoundaryCommand('backspace') },
      { key: 'Delete', run: makeBoundaryCommand('delete') },
    ]),
  );
}

/** Enter, while the selection exactly covers a block, acts like clicking its wording. */
function makeDirectiveEnterKeymap(config: RelationshipDirectivesConfig): Extension {
  const run: Command = (view) => {
    if (config.readOnly || view.state.readOnly) return false;
    const sel = view.state.selection.main;
    if (sel.empty) return false;

    const directive = directivesIn(view.state).find((d) => d.from === sel.from && d.to === sel.to);
    if (!directive) return false;

    const { library, defaultReason } = view.state.field(directiveContextField);
    const built = buildDirectiveView(
      directive,
      library,
      defaultReason,
      labelForNoteFrom(view.state),
      config.place ?? 'event',
    );
    if (built.kind === 'sentence') {
      const role = firstEditRole(built.parts);
      if (role) openDirectiveBubble(view, directive.from, role);
    }
    return true;
  };
  return Prec.high(keymap.of([{ key: 'Enter', run }]));
}

const directiveTheme = EditorView.theme({
  '.cm-directive': {
    position: 'relative',
    display: 'inline',
    padding: '0 4px',
    borderRadius: '4px',
    backgroundColor: 'var(--theme-directive-background)',
    border: '1px solid var(--theme-directive-border)',
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
    cursor: 'pointer',
  },
  '.cm-directive:hover': {
    backgroundColor: 'var(--theme-directive-hover)',
  },
  '.cm-directive-error': {
    borderColor: 'var(--theme-danger)',
  },
  '.cm-directive-unfinished': {
    borderColor: 'var(--theme-warning)',
  },
  '.cm-directive-value': {
    borderRadius: '3px',
    padding: '0 2px',
  },
  '.cm-directive-value:hover': {
    backgroundColor: 'var(--theme-directive-value-highlight)',
  },
  '.cm-directive-value-note': {
    fontWeight: '600',
  },
  '.cm-directive-value-attention': {
    color: 'var(--theme-warning)',
    fontStyle: 'italic',
  },
  '.cm-directive-value-error': {
    color: 'var(--theme-danger)',
    textDecoration: 'underline wavy var(--theme-danger)',
  },
  '.cm-directive-cross': {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '14px',
    height: '14px',
    lineHeight: '14px',
    textAlign: 'center',
    borderRadius: '50%',
    backgroundColor: 'var(--theme-danger)',
    color: 'var(--theme-background)',
    fontSize: '10px',
    opacity: '0',
  },
  '.cm-directive-cross::before': {
    content: '"\\00d7"',
  },
  '.cm-directive:hover .cm-directive-cross': {
    opacity: '1',
  },
  '.cm-directive-cross-start': {
    left: '-16px',
  },
  '.cm-directive-cross-end': {
    right: '-16px',
  },
});

/**
 * Renders relationship directives as atomic, form-like blocks. Live-mode
 * only — hosts must omit this extension in source mode (see
 * `markdown-editor.tsx`'s `buildModeExtensions`).
 */
export function relationshipDirectives(config: RelationshipDirectivesConfig = {}): Extension {
  const field = StateField.define<DecorationSet>({
    create: (state) => buildDecorations(state, config),
    update(value, tr) {
      if (
        tr.docChanged ||
        tr.effects.some((e) => e.is(setDirectiveContext) || e.is(setEntityLabels))
      ) {
        return buildDecorations(tr.state, config);
      }
      return value.map(tr.changes);
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  return [
    directiveContextField,
    // Read-only here (labels are pushed by the host via `setEntityLabels`,
    // dispatched by whichever extension needs it — usually `wikiLinks()`).
    // Included so `state.field(entityLabelMapField)` resolves even when this
    // extension is used without `wikiLinks()` in the same editor.
    entityLabelMapField,
    parsedDirectivesField,
    field,
    EditorView.atomicRanges.of((view) => view.state.field(field)),
    directiveTheme,
    makeDirectiveDeleteKeymap(),
    makeDirectiveEnterKeymap(config),
    // Ctrl/Cmd+left-click on a value is meant to open its note, not place a
    // caret. Because the directive block is an atomic `Decoration.replace`
    // range with `ignoreEvent() === false`, CodeMirror handles the mousedown
    // itself first — snapping the selection to cover the whole block — before
    // the browser's own click ever reaches the value span's listener. That
    // race is what makes plain Ctrl/Cmd+click unreliable (see this module's
    // AGENTS.md and its tests). `makePointerGuard` swallows the modified
    // pointerdown in the capture phase — exactly the trick `wiki-links.ts`
    // uses for `.cm-note-link` — so CodeMirror never gets to move the caret,
    // and the click (handled in `buildValueSpan`) fires reliably every time.
    makePointerGuard('.cm-directive-value'),
  ];
}
