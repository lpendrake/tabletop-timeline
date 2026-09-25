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
  parseDirectives,
  resolveTrack,
  extractBlanks,
  roleValue,
  noteIdOf,
  noteRoleValue,
  type ParsedDirective,
  type Role,
  type TrackLibrary,
} from '../../../../shared/relationships';
import type { PickerOption } from '../../searchable-picker';
import { computeCaretPlacement } from '../../context-menu/caret-position';
import { getCaretRect } from './editor-context-menu';
import {
  bubbleStateField,
  commitBubbleField,
  closeDirectiveBubble,
} from './relationship-bubble-state';
import {
  RelationshipBubble,
  type BubbleCommitDirection,
  type RelationshipBubbleProps,
} from './relationship-bubble';

const RECENT_NOTES_LIMIT = 5;

export interface RelationshipBubbleHostContext {
  library: TrackLibrary;
  defaultReason: string;
  noteOptions: () => readonly PickerOption[];
  defaultHolderId?: () => string | null;
  currentNoteId?: () => string | null;
  onHolderChosenWithoutDefault?: (id: string) => void;
  createOption?: (
    trackId: string,
    label: string,
    mutual: boolean,
  ) => Promise<{ key: string } | null>;
  heldOptions?: (q: {
    trackId: string;
    holder: string | null;
    observer: string | null;
    anchor: number;
  }) => string[];
}

function promptFor(role: Role, template: string): string {
  const blank = extractBlanks(template).find((b) => b.role === role);
  return blank?.prompt || `Choose ${role}`;
}

function noteIdFor(d: ParsedDirective, role: Role): string | null {
  return noteIdOf(roleValue(d, role) ?? '');
}

type BaseProps = Omit<RelationshipBubbleProps, 'style' | 'tailSide'>;

class RelationshipBubblePlugin {
  private host: HTMLDivElement | null = null;
  private root: Root | null = null;
  private recentNoteIds: string[] = [];

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
    commitBubbleField(this.view, anchor, role, written, direction);
    this.view.focus();
  }

  private sync(): void {
    const state = this.view.state.field(bubbleStateField, false);
    if (!state) {
      this.unmount();
      return;
    }

    const directive = parseDirectives(this.view.state.doc.toString()).directives.find(
      (d) => d.from === state.anchor,
    );
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

  private baseProps(anchor: number, role: Role, directive: ParsedDirective): BaseProps {
    const ctx = this.getContext();
    const track = resolveTrack(directive.trackId, ctx.library);
    const action = track?.action(directive.actionKey);
    const value = roleValue(directive, role) ?? '';
    const prompt = action ? promptFor(role, action.template) : `Choose ${role}`;

    const holderId = noteIdFor(directive, 'holder');
    const observerId = noteIdFor(directive, 'observer');
    const heldOptionKeys =
      role === 'option' && action?.kind === 'remove' && ctx.heldOptions
        ? ctx.heldOptions({
            trackId: directive.trackId,
            holder: holderId,
            observer: observerId,
            anchor,
          })
        : null;

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
      onHolderChosenWithoutDefault: ctx.onHolderChosenWithoutDefault,
      createOption: ctx.createOption,
      onCommit: (v: string, direction: BubbleCommitDirection) =>
        this.commit(anchor, role, v, direction),
      onClose: () => closeDirectiveBubble(this.view),
    };
  }

  /** Renders once (hidden) to get real dimensions, then repositions and re-renders visible. */
  private render(anchor: number, role: Role, directive: ParsedDirective): void {
    if (!this.root) return;
    const base = this.baseProps(anchor, role, directive);
    this.paint(base, { visibility: 'hidden', left: 0, top: 0 }, 'above');
    queueMicrotask(() => {
      if (!this.root || !this.host) return;
      const currentState = this.view.state.field(bubbleStateField, false);
      if (!currentState || currentState.anchor !== anchor || currentState.role !== role) return;
      const { style, side } = this.computePlacement(anchor);
      if (style) this.paint(base, style, side);
    });
  }

  private paint(base: BaseProps, style: React.CSSProperties, side: 'above' | 'below'): void {
    if (!this.root) return;
    const el: ReactElement = createElement(RelationshipBubble, { ...base, style, tailSide: side });
    this.root.render(el);
  }

  private computePlacement(anchor: number): {
    style: React.CSSProperties | null;
    side: 'above' | 'below';
  } {
    if (!this.host) return { style: null, side: 'above' };
    const coords = getCaretRect(this.view, anchor);
    if (!coords) return { style: null, side: 'above' };

    const lineRect = {
      left: coords.left,
      right: coords.right,
      top: coords.top,
      bottom: coords.bottom,
      width: coords.right - coords.left,
      height: coords.bottom - coords.top,
    };
    const size = { width: this.host.offsetWidth || 240, height: this.host.offsetHeight || 80 };
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const placement = computeCaretPlacement(lineRect, size, viewport, 'above');

    const style: React.CSSProperties =
      placement.side === 'below'
        ? { left: placement.left, top: placement.top, visibility: 'visible' }
        : { left: placement.left, bottom: placement.bottom, visibility: 'visible' };
    return { style, side: placement.side };
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
    bubbleStateField,
    ViewPlugin.define((view) => new RelationshipBubblePlugin(view, getContext)),
  ];
}
