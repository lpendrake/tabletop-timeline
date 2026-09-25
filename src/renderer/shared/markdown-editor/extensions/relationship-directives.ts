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
  ViewPlugin,
  WidgetType,
  keymap,
  type Command,
  type DecorationSet,
} from '@codemirror/view';
import {
  parseDirectives,
  interpretDirective,
  readableParts,
  resolveTrack,
  type ParsedDirective,
  type ReadablePart,
  type Role,
  type TrackLibrary,
} from '../../../../shared/relationships';
import { entityLabelMapField, setEntityLabels } from './wiki-links';

export interface RelationshipDirectivesConfig {
  readOnly?: boolean;
  onOpenNote?: (id: string) => void;
  onEditField?: (target: { from: number; ordinal: number }, role: Role) => void;
}

interface DirectiveContext {
  library: TrackLibrary;
  defaultReason: string;
}

const EMPTY_LIBRARY: TrackLibrary = { custom: [], optionAdditions: {} };
const DEFAULT_CONTEXT: DirectiveContext = { library: EMPTY_LIBRARY, defaultReason: 'Unspecified' };

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

type DirectiveView = { kind: 'error'; title: string } | { kind: 'sentence'; parts: ReadablePart[] };

type ValuePart = Extract<ReadablePart, { kind: 'value' }>;

/** Picks the field a click on the wording (or an Enter on a selected block) should target. */
export function firstEditRole(parts: ReadablePart[]): Role | null {
  const values = parts.filter((p): p is ValuePart => p.kind === 'value');
  const empty = values.find((p) => p.empty);
  if (empty) return empty.role;
  return values[0]?.role ?? null;
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

function resolveDirectiveTrack(id: string, library: TrackLibrary) {
  return resolveTrack(id, library);
}

/** Interprets a directive against the library and produces its display view. */
function buildDirectiveView(
  d: ParsedDirective,
  library: TrackLibrary,
  defaultReason: string,
  labelForNote: (id: string) => string,
): DirectiveView {
  const track = resolveDirectiveTrack(d.trackId, library);
  const interpreted = interpretDirective(d, {
    resolveTrack: (id) => resolveDirectiveTrack(id, library),
  });

  if (interpreted.status === 'invalid') {
    const blocking = interpreted.problems.find(
      (p) => p.code === 'unknown-track' || p.code === 'unknown-action',
    );
    if (blocking) return { kind: 'error', title: blocking.message };
  }

  const problems = interpreted.status === 'invalid' ? interpreted.problems : [];
  const parts = readableParts(d, { track, labelForNote, defaultReason, problems });
  return { kind: 'sentence', parts };
}

function directivesIn(state: EditorState): ParsedDirective[] {
  return parseDirectives(state.doc.toString()).directives;
}

function labelForNoteFrom(state: EditorState): (id: string) => string {
  const map = state.field(entityLabelMapField, false) ?? new Map<string, string>();
  return (id: string) => map.get(id) ?? id;
}

class DirectiveWidget extends WidgetType {
  constructor(
    readonly directive: ParsedDirective,
    readonly built: DirectiveView,
    readonly readOnly: boolean,
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

  override toDOM(): HTMLElement {
    const root = document.createElement('span');
    root.className =
      this.built.kind === 'error' ? 'cm-directive cm-directive-error' : 'cm-directive';
    root.dataset.from = String(this.directive.from);
    root.dataset.to = String(this.directive.to);
    root.dataset.ordinal = String(this.directive.ordinal);

    if (this.built.kind === 'error') {
      root.title = this.built.title;
      root.textContent = this.directive.raw;
    } else {
      for (const part of this.built.parts) {
        if (part.kind === 'text') {
          root.appendChild(document.createTextNode(part.text));
          continue;
        }
        root.appendChild(this.buildValueSpan(part));
      }
    }

    if (!this.readOnly) {
      const cross = document.createElement('span');
      cross.className = 'cm-directive-cross cm-directive-cross-end';
      cross.setAttribute('aria-hidden', 'true');
      // The '×' glyph is drawn via CSS `content` (see `directiveTheme`), not
      // as text content, so it never appears in the block's `textContent` —
      // that must stay exactly the readable sentence.
      root.dataset.crossEnd = 'end';
      root.appendChild(cross);
    }

    return root;
  }

  private buildValueSpan(part: ValuePart): HTMLElement {
    const span = document.createElement('span');
    span.dataset.role = part.role;
    const classes = ['cm-directive-value'];
    if (part.problem) {
      classes.push('cm-directive-value-error');
      span.title = part.problem.message;
    } else if (part.empty) {
      classes.push('cm-directive-value-attention');
    }
    if ((part.role === 'holder' || part.role === 'observer') && part.noteId) {
      span.dataset.noteId = part.noteId;
      classes.push('cm-directive-value-note');
    }
    span.className = classes.join(' ');
    span.textContent = part.display;
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

  const builder = new RangeSetBuilder<Decoration>();
  for (const d of directivesIn(state)) {
    const built = buildDirectiveView(d, library, defaultReason, labelForNote);
    builder.add(
      d.from,
      d.to,
      Decoration.replace({ widget: new DirectiveWidget(d, built, readOnly) }),
    );
  }
  return builder.finish();
}

function makeDirectiveClickHandler(config: RelationshipDirectivesConfig): Extension {
  return EditorView.domEventHandlers({
    click(event, view) {
      if (event.button !== 0) return false;
      const target = event.target as HTMLElement;
      const block = target.closest<HTMLElement>('.cm-directive');
      if (!block) return false;

      const from = Number(block.dataset.from);
      const to = Number(block.dataset.to);
      const ordinal = Number(block.dataset.ordinal);
      const modified = event.ctrlKey || event.metaKey;

      const cross = target.closest<HTMLElement>('.cm-directive-cross');
      if (cross && !config.readOnly) {
        event.preventDefault();
        event.stopPropagation();
        view.dispatch({ changes: { from, to, insert: '' }, userEvent: 'delete.directive' });
        return true;
      }

      const valueEl = target.closest<HTMLElement>('.cm-directive-value');
      if (valueEl) {
        const noteId = valueEl.dataset.noteId;
        event.preventDefault();
        event.stopPropagation();
        if (modified && noteId) {
          config.onOpenNote?.(noteId);
          return true;
        }
        if (!modified && !config.readOnly) {
          const role = valueEl.dataset.role as Role;
          config.onEditField?.({ from, ordinal }, role);
        }
        return true;
      }

      event.preventDefault();
      event.stopPropagation();
      if (!config.readOnly) {
        const directive = directivesIn(view.state).find((d) => d.from === from);
        if (directive) {
          const { library, defaultReason } = view.state.field(directiveContextField);
          const built = buildDirectiveView(
            directive,
            library,
            defaultReason,
            labelForNoteFrom(view.state),
          );
          if (built.kind === 'sentence') {
            const role = firstEditRole(built.parts);
            if (role) config.onEditField?.({ from, ordinal }, role);
          }
        }
      }
      return true;
    },
  });
}

function makeDirectiveContextMenuHandler(): Extension {
  return EditorView.domEventHandlers({
    contextmenu(event, view) {
      const target = event.target as HTMLElement;
      const block = target.closest<HTMLElement>('.cm-directive');
      if (!block) return false;
      const from = Number(block.dataset.from);
      const to = Number(block.dataset.to);
      if (Number.isNaN(from) || Number.isNaN(to)) return false;
      view.dispatch({ selection: { anchor: from, head: to } });
      return false;
    },
  });
}

function makeDirectiveHoverPlugin(): Extension {
  return ViewPlugin.fromClass(
    class {
      private readonly onMove = (event: MouseEvent) => {
        const target = (event.target as HTMLElement)?.closest?.<HTMLElement>('.cm-directive');
        const cross = target?.querySelector<HTMLElement>('.cm-directive-cross');
        if (!target || !cross) return;

        const rects = Array.from(target.getClientRects());
        const rect =
          rects.find((r) => event.clientY >= r.top && event.clientY <= r.bottom) ??
          rects[rects.length - 1];
        if (!rect || rect.width === 0) return;

        const fraction = (event.clientX - rect.left) / rect.width;
        const previous = (target.dataset.crossEnd as 'start' | 'end') ?? 'end';
        const next = crossEnd(fraction, previous);
        if (next === previous) return;

        target.dataset.crossEnd = next;
        cross.classList.toggle('cm-directive-cross-start', next === 'start');
        cross.classList.toggle('cm-directive-cross-end', next === 'end');
      };

      constructor(readonly view: EditorView) {
        view.dom.addEventListener('mousemove', this.onMove);
      }

      destroy() {
        this.view.dom.removeEventListener('mousemove', this.onMove);
      }
    },
  );
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
    );
    if (built.kind === 'sentence') {
      const role = firstEditRole(built.parts);
      if (role) config.onEditField?.({ from: directive.from, ordinal: directive.ordinal }, role);
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
    borderColor: 'var(--theme-directive-error)',
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
    color: 'var(--theme-directive-attention)',
    fontStyle: 'italic',
  },
  '.cm-directive-value-error': {
    color: 'var(--theme-directive-error)',
    textDecoration: 'underline wavy var(--theme-directive-error)',
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
    backgroundColor: 'var(--theme-directive-delete)',
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
    field,
    EditorView.atomicRanges.of((view) => view.state.field(field)),
    directiveTheme,
    makeDirectiveClickHandler(config),
    makeDirectiveContextMenuHandler(),
    makeDirectiveHoverPlugin(),
    makeDirectiveDeleteKeymap(),
    makeDirectiveEnterKeymap(config),
  ];
}
