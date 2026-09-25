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
import { computeCaretPlacement } from '../../context-menu/caret-position';
import { getCaretRect, type CaretRect } from './editor-context-menu';
import { getDirectiveRoleElement } from './relationship-directives';
import { computeTailOffset, type BubbleCommitDirection } from './relationship-bubble-logic';
import {
  bubbleStateField,
  commitBubbleField,
  closeDirectiveBubble,
} from './relationship-bubble-state';
import { directivesIn, parsedDirectivesField } from './parsed-directives';
import { RelationshipBubble, type RelationshipBubbleProps } from './relationship-bubble';

/** Default tail offset used for the initial hidden measuring paint, before any geometry is known. */
const DEFAULT_TAIL_OFFSET = 16;

const RECENT_NOTES_LIMIT = 5;

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
  onHolderChosenWithoutDefault?: (id: string) => void;
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

type BaseProps = Omit<RelationshipBubbleProps, 'style' | 'tailSide' | 'visible' | 'tailOffset'>;

class RelationshipBubblePlugin {
  private host: HTMLDivElement | null = null;
  private root: Root | null = null;
  private recentNoteIds: string[] = [];

  /** Bumped on every `heldOptions` request; a response is discarded once it no longer matches. */
  private heldOptionsToken = 0;
  private heldOptionsPendingKey: string | null = null;
  private heldOptionsCache: { key: string; keys: string[] } | null = null;

  constructor(
    readonly view: EditorView,
    readonly getContext: () => RelationshipBubbleHostContext,
  ) {
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
    this.unmount();
  }

  private rememberNote(id: string | null): void {
    if (!id) return;
    this.recentNoteIds = [id, ...this.recentNoteIds.filter((n) => n !== id)].slice(
      0,
      RECENT_NOTES_LIMIT,
    );
  }

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
      this.rememberNote(id || null);
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
    this.root = createRoot(this.host);
  }

  private unmount(): void {
    if (!this.root) return;
    const root = this.root;
    const host = this.host;
    this.root = null;
    this.host = null;
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
      role,
      value,
      prompt,
      track: track ?? null,
      trackId: directive.trackId,
      defaultReason: ctx.defaultReason,
      noteOptions: ctx.noteOptions(),
      recentNoteIds: this.recentNoteIds,
      defaultHolderId: ctx.defaultHolderId?.() ?? null,
      currentNoteId: ctx.currentNoteId?.() ?? null,
      heldOptionKeys,
      heldOptionsLoading,
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
    );
    queueMicrotask(() => {
      if (!this.root || !this.host) return;
      const currentState = this.view.state.field(bubbleStateField, false);
      if (!currentState || currentState.anchor !== anchor || currentState.role !== role) return;
      const { style, side, tailOffset } = this.computePlacement(anchor, role);
      if (style) this.paint(base, style, side, true, tailOffset);
    });
  }

  private paint(
    base: BaseProps,
    style: React.CSSProperties,
    side: 'above' | 'below',
    visible: boolean,
    tailOffset: number,
  ): void {
    if (!this.root) return;
    const el: ReactElement = createElement(RelationshipBubble, {
      ...base,
      style,
      tailSide: side,
      visible,
      tailOffset,
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
    side: 'above' | 'below';
    tailOffset: number;
  } {
    if (!this.host) return { style: null, side: 'above', tailOffset: DEFAULT_TAIL_OFFSET };
    const lineCoords = getCaretRect(this.view, anchor);
    if (!lineCoords) return { style: null, side: 'above', tailOffset: DEFAULT_TAIL_OFFSET };

    const blankRect = this.blankRect(anchor, role);
    const horizontal = blankRect ?? lineCoords;

    const lineRect = {
      left: horizontal.left,
      right: horizontal.right,
      top: lineCoords.top,
      bottom: lineCoords.bottom,
      width: horizontal.right - horizontal.left,
      height: lineCoords.bottom - lineCoords.top,
    };
    const size = { width: this.host.offsetWidth || 240, height: this.host.offsetHeight || 80 };
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const placement = computeCaretPlacement(lineRect, size, viewport, 'above');

    const blankCenterX = (horizontal.left + horizontal.right) / 2;
    const tailOffset = computeTailOffset(blankCenterX, placement.left, size.width);

    const style: React.CSSProperties =
      placement.side === 'below'
        ? { left: placement.left, top: placement.top, visibility: 'visible' }
        : { left: placement.left, bottom: placement.bottom, visibility: 'visible' };
    return { style, side: placement.side, tailOffset };
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
