/**
 * Editor-state home for the fill-in bubble: which blank (if any) is open,
 * mapped through every document change so it follows its blank, and closed
 * cleanly (no error, no stray edit) the moment its directive stops existing
 * — deleted, undone, or replaced wholesale by an external reload.
 *
 * No rendering here — see `extensions/relationship-bubble-view-plugin.ts`
 * for the ViewPlugin that mounts the React bubble in response to this state.
 */
import { MapMode, StateEffect, StateField, type EditorState } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import {
  parseDirectives,
  setRoleValueChange,
  type ParsedDirective,
  type Role,
} from '../../../../shared/relationships';
import { firstBlankRole, nextBlankRole, previousBlankRole } from './relationship-bubble-logic';

export interface BubbleAnchor {
  /** The directive's `from` at the time the bubble was opened — mapped on every change. */
  anchor: number;
  role: Role;
}

export const openBubbleEffect = StateEffect.define<BubbleAnchor>();
export const closeBubbleEffect = StateEffect.define<null>();

function directiveAt(state: EditorState, anchor: number): ParsedDirective | null {
  return parseDirectives(state.doc.toString()).directives.find((d) => d.from === anchor) ?? null;
}

export const bubbleStateField = StateField.define<BubbleAnchor | null>({
  create: () => null,
  update(value, tr) {
    let next = value;
    for (const effect of tr.effects) {
      if (effect.is(openBubbleEffect)) next = effect.value;
      else if (effect.is(closeBubbleEffect)) next = null;
    }

    if (next && tr.docChanged) {
      const mapped = tr.changes.mapPos(next.anchor, -1, MapMode.TrackDel);
      if (mapped === null) {
        next = null;
      } else {
        next = { ...next, anchor: mapped };
      }
    }

    // Re-validate against the (possibly new) document even when unmapped by
    // this transaction — covers a full-document replace whose length happens
    // to leave `anchor` in range but pointing at unrelated text.
    if (next) {
      const directive = directiveAt(tr.state, next.anchor);
      if (!directive || !directive.tokens.some((t) => t.role === next!.role)) {
        next = null;
      }
    }

    return next;
  },
});

/** Opens the bubble for `role` on the directive starting at `anchor`. Read-only callers should guard first. */
export function openDirectiveBubble(view: EditorView, anchor: number, role: Role): void {
  view.dispatch({ effects: openBubbleEffect.of({ anchor, role }) });
}

export function closeDirectiveBubble(view: EditorView): void {
  view.dispatch({ effects: closeBubbleEffect.of(null) });
}

/**
 * Inserts a freshly-filled directive as one undo step and opens the bubble
 * for its first blank (first empty token, else the first token) — order is
 * the order of `{role…}` tokens in `text`. The insert and the bubble-open
 * are one transaction, so there's nothing to observe in between.
 */
export function insertDirective(view: EditorView, from: number, to: number, text: string): void {
  const probe = parseDirectives(text).directives[0];
  const role = probe ? firstBlankRole(probe) : null;

  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
    effects: role ? [openBubbleEffect.of({ anchor: from, role })] : [],
    userEvent: 'input.directive',
    annotations: isolateHistory.of('full'),
  });
}

export type BubbleCommitDirection = 'advance' | 'back' | 'hop-next' | 'hop-prev';
export type BubbleCommitOutcome = 'moved' | 'stayed' | 'closed' | 'failed';

/**
 * Writes `value` into `role`'s token on the directive at `anchor`, and moves
 * the bubble to the next/previous blank in the same transaction (so writing
 * and moving are one undo step, and there's no in-between render where the
 * bubble is open on a role whose value hasn't been written yet). Returns
 * `'failed'` (no dispatch) when the directive or role no longer exists —
 * e.g. the bubble is closing on stale state.
 */
export function commitBubbleField(
  view: EditorView,
  anchor: number,
  role: Role,
  value: string,
  direction: BubbleCommitDirection,
): BubbleCommitOutcome {
  const directive = directiveAt(view.state, anchor);
  if (!directive) return 'failed';
  const edit = setRoleValueChange(directive, role, value);
  if (!edit) return 'failed';

  const roles = directive.tokens.map((t) => t.role as Role);
  const forward = direction === 'advance' || direction === 'hop-next';
  const target = forward ? nextBlankRole(roles, role) : previousBlankRole(roles, role);

  let outcome: BubbleCommitOutcome;
  const effects = [];
  if (target) {
    effects.push(openBubbleEffect.of({ anchor, role: target }));
    outcome = 'moved';
  } else if (direction === 'advance' || direction === 'hop-next') {
    effects.push(closeBubbleEffect.of(null));
    outcome = 'closed';
  } else {
    outcome = 'stayed';
  }

  view.dispatch({
    changes: edit,
    effects,
    userEvent: 'input.directive',
    annotations: isolateHistory.of('full'),
  });
  return outcome;
}

export { directiveAt as directiveAtAnchor };
