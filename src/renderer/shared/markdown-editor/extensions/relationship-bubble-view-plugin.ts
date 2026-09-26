/**
 * Mounts the floating fill-in bubble (`relationship-bubble.tsx`) outside
 * `view.dom`, on `document.body`, and keeps it synced to `bubbleStateField`:
 * opens/repositions/closes as that field changes, follows the doc, and
 * unmounts cleanly. No business logic here — this only wires editor state
 * and host-supplied data to the presentational React component.
 */
import { createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import {
  resolveTrack,
  roleValue,
  noteIdOf,
  noteRoleValue,
  promptFor,
  type ParsedDirective,
  type Role,
  type TrackLibrary,
} from '../../../../shared/relationships';
import type { PickerOption } from '../../searchable-picker';
import { getCaretRect, type CaretRect } from './editor-context-menu';
import { getDirectiveRoleElement } from './relationship-directives';
import {
  bubbleVerticalAnchors,
  clampBubbleLeft,
  computeTailOffset,
  planBubbleFit,
  type BubbleCommitDirection,
  type BubbleSide,
} from './relationship-bubble-logic';
import {
  bubbleStateField,
  commitBubbleField,
  closeDirectiveBubble,
} from './relationship-bubble-state';
import { directivesIn, parsedDirectivesField } from './parsed-directives';
import { RelationshipBubble, type RelationshipBubbleProps } from './relationship-bubble';
import { getRecentNoteIds, rememberRecentNote } from './relationship-recent-notes';

/** Default tail offset used for the initial hidden measuring paint, before any geometry is known. */
const DEFAULT_TAIL_OFFSET = 16;

/**
 * The query the bubble sends to the host's `heldOptions` resolver: which
 * (track, holder, observer) ledger to fold, the blank's directive anchor
 * (to exclude that directive's own delta from the fold), and the buffer's
 * current text (the host has no other way to locate the directive — it
 * never reads the editor's state directly).
 */
export interface HeldOptionsQuery {
  trackId: string;
  holder: string | null;
  observer: string | null;
  anchor: number;
  doc: string;
}

/**
 * The bubble-specific slice of host data/callbacks — everything
 * `markdown-editor.tsx`'s `RelationshipDirectivesHostConfig.bubbles` also
 * declares, so the two types are defined here once and referenced by both
 * (`RelationshipBubbleHostContext` below adds `library`/`defaultReason`,
 * which `relationship-directives.ts` already carries at the top level of
 * its own config).
 */
export interface RelationshipBubbleOptions {
  noteOptions: () => readonly PickerOption[];
  defaultHolderId?: () => string | null;
  currentNoteId?: () => string | null;
  /**
   * May return a `Promise` (e.g. a confirm dialog) — the bubble awaits it
   * before advancing to the next blank, so focus lands there only once the
   * dialog is gone rather than being stolen back by it. See
   * `relationship-bubble.tsx`'s `NotePickerField.commitPick`.
   */
  onHolderChosenWithoutDefault?: (id: string) => void | Promise<void>;
  createOption?: (
    trackId: string,
    label: string,
    mutual: boolean,
  ) => Promise<{ key: string } | null>;
  /**
   * Resolves which of a categorical track's options are currently held on
   * the (holder, observer) ledger — used by the "remove" bubble's option
   * picker. Async so a host can look this up via IO (the main-process
   * ledger store); the bubble shows a loading state until it resolves and
   * ignores a response that's no longer for the currently-open blank (see
   * `RelationshipBubblePlugin`'s `heldOptionsToken`).
   */
  heldOptions?: (q: HeldOptionsQuery) => Promise<string[]>;
}

export interface RelationshipBubbleHostContext extends RelationshipBubbleOptions {
  library: TrackLibrary;
  defaultReason: string;
}

function noteIdFor(d: ParsedDirective, role: Role): string | null {
  return noteIdOf(roleValue(d, role) ?? '');
}

/**
 * Every bubble host currently mounted on `document.body` (normally at most
 * one, but the editor can host several instances). Membership is
 * synchronous with `bubbleStateField` closing — `unmount()` removes a host
 * here immediately, even though the actual DOM node removal is deferred a
 * microtask — so a check made right after a close (e.g. the event editor's
 * own Escape handler, in the same keydown) sees the bubble as already
 * closed.
 */
const openBubbleHosts = new Set<HTMLElement>();

/**
 * Whether a relationship bubble is currently open — used by hosts (e.g.
 * `EventEditorModal`'s document-level Escape listener) that must not act on
 * an event the bubble itself is already handling. With `target` given, only
 * reports open when `target` is actually inside one of the open bubbles'
 * hosts (not e.g. some unrelated element while a bubble happens to be open
 * elsewhere in the document). This is a containment check against the
 * bubble's own host element, never a `data-*` read.
 */
export function isRelationshipBubbleOpen(target?: EventTarget | null): boolean {
  if (openBubbleHosts.size === 0) return false;
  if (target === undefined) return true;
  if (!(target instanceof Node)) return false;
  for (const host of openBubbleHosts) {
    if (host.contains(target)) return true;
  }
  return false;
}

type BaseProps = Omit<
  RelationshipBubbleProps,
  'style' | 'tailSide' | 'visible' | 'tailOffset' | 'listMaxHeight'
>;

class RelationshipBubblePlugin {
  private host: HTMLDivElement | null = null;
  private root: Root | null = null;

  /**
   * Held reference to the currently-mounted `SearchablePicker`'s option
   * list (see `RelationshipBubbleProps.listRef`) — `computePlacement` reads
   * its and its first row's real height off this instead of querying the
   * DOM. Cleared to `null` automatically by React when the field unmounts
   * (e.g. a field with no picker, like `NumberField`).
   */
  private readonly listRef: { current: HTMLDivElement | null } = { current: null };

  /**
   * Held reference to the actual rendered `.relationship-bubble` root —
   * `computePlacement` measures its real width/height off this instead of
   * `this.host` (the mounting div), which stays 0x0: it's `position:
   * fixed` and its only child (the bubble root) is `position: fixed` too,
   * so the child never contributes to the host's own box size. Using the
   * host's collapsed size fell back to hardcoded 240x80 defaults, which
   * corrupted the chrome/list-height split `planBubbleFit` relies on and
   * is why the bubble could still render off the top of the screen even
   * though the list appeared to shrink.
   */
  private readonly bubbleRef: { current: HTMLDivElement | null } = { current: null };

  /** Bumped on every `heldOptions` request; a response is discarded once it no longer matches. */
  private heldOptionsToken = 0;
  private heldOptionsPendingKey: string | null = null;
  private heldOptionsCache: { key: string; keys: string[] } | null = null;

  constructor(
    readonly view: EditorView,
    readonly getContext: () => RelationshipBubbleHostContext,
  ) {
    document.addEventListener('pointerdown', this.handleOutsidePointerDown);
    this.sync();
  }

  update(update: ViewUpdate): void {
    const before = update.startState.field(bubbleStateField, false);
    const after = update.state.field(bubbleStateField, false);
    if (before !== after || update.docChanged || update.geometryChanged || update.viewportChanged) {
      this.sync();
    }
  }

  destroy(): void {
    document.removeEventListener('pointerdown', this.handleOutsidePointerDown);
    this.unmount();
  }

  /**
   * Closes the bubble on a pointerdown outside its host — never calls
   * `preventDefault`/`stopPropagation`, so the click still does whatever it
   * would otherwise do (place the editor caret, follow a link, etc).
   */
  private handleOutsidePointerDown = (e: PointerEvent): void => {
    if (!this.host) return;
    if (e.target instanceof Node && this.host.contains(e.target)) return;
    closeDirectiveBubble(this.view);
  };

  private commit(
    anchor: number,
    role: Role,
    value: string,
    direction: BubbleCommitDirection,
  ): void {
    let written = value;
    if (role === 'holder' || role === 'observer') {
      // The bubble's note picker deals in bare ids; directives store `[[id]]`.
      const id = noteIdOf(value) ?? value;
      rememberRecentNote(id || null);
      written = id ? noteRoleValue(id) : value;
    }
    const outcome = commitBubbleField(this.view, anchor, role, written, direction);
    // Only hand focus back to the editor once the bubble is actually gone
    // ('moved'/'stayed' keep it open on another blank, which should keep
    // focus itself — see `relationship-bubble.tsx`'s `useBubbleFocus`).
    if (outcome === 'closed' || outcome === 'failed') this.view.focus();
  }

  private sync(): void {
    const state = this.view.state.field(bubbleStateField, false);
    if (!state) {
      this.unmount();
      return;
    }

    const directive = directivesIn(this.view.state).find((d) => d.from === state.anchor);
    if (!directive) {
      this.unmount();
      return;
    }

    if (!this.host) this.mount();
    this.render(state.anchor, state.role, directive);
  }

  private mount(): void {
    this.host = document.createElement('div');
    this.host.className = 'relationship-bubble-host';
    document.body.appendChild(this.host);
    openBubbleHosts.add(this.host);
    this.root = createRoot(this.host);
  }

  private unmount(): void {
    if (!this.root) return;
    const root = this.root;
    const host = this.host;
    this.root = null;
    this.host = null;
    if (host) openBubbleHosts.delete(host);
    queueMicrotask(() => {
      root.unmount();
      host?.remove();
    });
  }

  /**
   * Resolves `heldOptionKeys`/`heldOptionsLoading` for the "remove" option
   * bubble: returns the cached result for this exact (track, holder,
   * observer, anchor) query when there is one, otherwise kicks off (at
   * most one in flight per key) an async fetch via the host's
   * `heldOptions` and reports loading until it resolves. A response is
   * applied only while `heldOptionsToken` still matches the request that
   * produced it — a later call (a different blank, a doc edit) bumps the
   * token first, so a stale response is silently dropped instead of
   * clobbering newer state.
   */
  private heldOptionsFor(
    ctx: RelationshipBubbleHostContext,
    q: Omit<HeldOptionsQuery, 'doc'>,
  ): { keys: string[] | null; loading: boolean } {
    if (!ctx.heldOptions) return { keys: null, loading: false };
    const key = JSON.stringify(q);
    if (this.heldOptionsCache?.key === key) {
      return { keys: this.heldOptionsCache.keys, loading: false };
    }
    if (this.heldOptionsPendingKey !== key) {
      this.heldOptionsPendingKey = key;
      const token = ++this.heldOptionsToken;
      const doc = this.view.state.doc.toString();
      void ctx.heldOptions({ ...q, doc }).then((keys) => {
        if (token !== this.heldOptionsToken) return; // stale — a newer request has since superseded this one
        this.heldOptionsCache = { key, keys };
        if (this.heldOptionsPendingKey === key) this.heldOptionsPendingKey = null;
        this.sync();
      });
    }
    return { keys: null, loading: true };
  }

  private baseProps(anchor: number, role: Role, directive: ParsedDirective): BaseProps {
    const ctx = this.getContext();
    const track = resolveTrack(directive.trackId, ctx.library);
    const action = track?.action(directive.actionKey);
    const value = roleValue(directive, role) ?? '';
    const prompt = action ? promptFor(role, action.template) : `choose ${role}`;

    const holderId = noteIdFor(directive, 'holder');
    const observerId = noteIdFor(directive, 'observer');
    const { keys: heldOptionKeys, loading: heldOptionsLoading } =
      role === 'option' && action?.kind === 'remove'
        ? this.heldOptionsFor(ctx, {
            trackId: directive.trackId,
            holder: holderId,
            observer: observerId,
            anchor,
          })
        : { keys: null, loading: false };

    return {
      anchor,
      role,
      value,
      prompt,
      track: track ?? null,
      trackId: directive.trackId,
      defaultReason: ctx.defaultReason,
      noteOptions: ctx.noteOptions(),
      recentNoteIds: getRecentNoteIds(),
      defaultHolderId: ctx.defaultHolderId?.() ?? null,
      currentNoteId: ctx.currentNoteId?.() ?? null,
      heldOptionKeys,
      heldOptionsLoading,
      listRef: this.listRef,
      bubbleRef: this.bubbleRef,
      onHolderChosenWithoutDefault: ctx.onHolderChosenWithoutDefault,
      createOption: ctx.createOption,
      onCommit: (v: string, direction: BubbleCommitDirection) =>
        this.commit(anchor, role, v, direction),
      onClose: () => {
        closeDirectiveBubble(this.view);
        this.view.focus();
      },
    };
  }

  /** Renders once (hidden) to get real dimensions, then repositions and re-renders visible. */
  private render(anchor: number, role: Role, directive: ParsedDirective): void {
    if (!this.root) return;
    const base = this.baseProps(anchor, role, directive);
    this.paint(
      base,
      { visibility: 'hidden', left: 0, top: 0 },
      'above',
      false,
      DEFAULT_TAIL_OFFSET,
      null,
    );
    queueMicrotask(() => {
      if (!this.root || !this.host) return;
      const currentState = this.view.state.field(bubbleStateField, false);
      if (!currentState || currentState.anchor !== anchor || currentState.role !== role) return;
      const { style, side, tailOffset, listMaxHeight } = this.computePlacement(anchor, role);
      if (style) this.paint(base, style, side, true, tailOffset, listMaxHeight);
    });
  }

  private paint(
    base: BaseProps,
    style: React.CSSProperties,
    side: BubbleSide,
    visible: boolean,
    tailOffset: number,
    listMaxHeight: number | null,
  ): void {
    if (!this.root) return;
    const el: ReactElement = createElement(RelationshipBubble, {
      ...base,
      style,
      tailSide: side,
      visible,
      tailOffset,
      listMaxHeight,
    });
    this.root.render(el);
  }

  /**
   * Vertical placement stays anchored to the directive's line (via
   * `getCaretRect` at the directive's start, as before). Horizontally, the
   * box — and its tail — point at the blank actually being edited: its
   * rendered element, held by the directive widget's own instance (see
   * `getDirectiveRoleElement` in `relationship-directives.ts`), falling
   * back to the line's own rect when the block isn't rendered (e.g. a
   * doc-changed race) or has no such blank.
   */
  private computePlacement(
    anchor: number,
    role: Role,
  ): {
    style: React.CSSProperties | null;
    side: BubbleSide;
    tailOffset: number;
    listMaxHeight: number | null;
  } {
    const empty = {
      style: null,
      side: 'above' as const,
      tailOffset: DEFAULT_TAIL_OFFSET,
      listMaxHeight: null,
    };
    if (!this.host) return empty;
    const lineCoords = getCaretRect(this.view, anchor);
    if (!lineCoords) return empty;

    const blankRect = this.blankRect(anchor, role);
    const horizontal = blankRect ?? lineCoords;

    // Measured off the bubble's own root, not `this.host` — see `bubbleRef`'s doc comment.
    const bubbleEl = this.bubbleRef.current;
    const size = { width: bubbleEl?.offsetWidth || 240, height: bubbleEl?.offsetHeight || 80 };
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const anchors = bubbleVerticalAnchors(lineCoords.top, lineCoords.bottom, viewport.height);

    const list = this.listRef.current;
    const listHeight = list?.offsetHeight ?? 0;
    const rowHeight = (list?.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0;
    const chromeHeight = size.height - listHeight;

    const plan = planBubbleFit(anchors, size.height, chromeHeight, rowHeight);
    const left = clampBubbleLeft(horizontal.left, size.width, viewport.width);

    const blankCenterX = (horizontal.left + horizontal.right) / 2;
    const tailOffset = computeTailOffset(blankCenterX, left, size.width);

    const style: React.CSSProperties =
      plan.side === 'below'
        ? { left, top: anchors.belowTop, visibility: 'visible' }
        : { left, bottom: anchors.aboveBottom, visibility: 'visible' };
    return { style, side: plan.side, tailOffset, listMaxHeight: plan.listMaxHeight };
  }

  /** The blank's own rendered rect, from the widget's held element reference — never a DOM query. */
  private blankRect(anchor: number, role: Role): CaretRect | null {
    const el = getDirectiveRoleElement(this.view, anchor, role);
    if (!el) return null;
    return el.getBoundingClientRect();
  }
}

/**
 * The bubble's rendering extension. Include alongside `relationshipDirectives()`
 * in live mode; omit in source mode and in read-only editors (the bubble
 * never opens there, since `relationshipDirectives()` never dispatches
 * `openBubbleEffect` when read-only).
 */
export function relationshipBubble(getContext: () => RelationshipBubbleHostContext): Extension {
  return [
    // Included so `directivesIn`/`state.field(parsedDirectivesField)` resolve
    // even when this extension is mounted standalone (e.g. a test) without
    // `relationshipDirectives()` in the same editor — CodeMirror dedupes an
    // identical StateField extension, so this is a no-op when both are present.
    parsedDirectivesField,
    bubbleStateField,
    ViewPlugin.define((view) => new RelationshipBubblePlugin(view, getContext)),
  ];
}
