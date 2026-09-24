/**
 * Whether a context menu is currently open, kept as a small counter/registry
 * that `context-menu.tsx` updates from a mount/unmount effect on the root
 * `<ContextMenu>` — this covers both an in-tree `<ContextMenu>` and
 * `showContextMenu`'s own root (it renders the same component), unlike a
 * MutationObserver watching `document.body`, which only ever saw
 * `showContextMenu`'s body-level host.
 *
 * Used by hosts that must suspend or react to a context menu being open:
 * - the timeline's keyboard shortcuts suspend their own key handling while a
 *   menu is open (`isBlocked` in `timeline-view.tsx`), via `isContextMenuOpen`.
 * - the peek stack keeps a peek open while a menu opened from it is up, and
 *   re-checks the hover state once the last menu closes, via
 *   `onContextMenuOpenChange` (see `peek/stack.ts`).
 */

type Listener = (open: boolean) => void;

let openCount = 0;
const listeners = new Set<Listener>();

function notify(): void {
  // Registry-only, deliberately not `isContextMenuOpen()` — that also
  // queries the DOM, and a listener can run mid-unmount, a tick before a
  // closing menu's `.context-menu` node is actually detached, which would
  // make the OR'd DOM check report "still open" right when the registry
  // itself just went to zero. Listeners get the plain registry state.
  const open = openCount > 0;
  for (const listener of listeners) listener(open);
}

/**
 * Registers one open menu. Call once per mounted root `<ContextMenu>` (e.g.
 * from a `useEffect` with no dependencies) and call the returned function on
 * unmount. Listeners are notified only on the 0→1 and 1→0 transitions, not
 * on every register/unregister — nested/overlapping menus don't spam them.
 */
export function registerContextMenuOpen(): () => void {
  openCount++;
  if (openCount === 1) notify();
  let unregistered = false;
  return () => {
    if (unregistered) return;
    unregistered = true;
    openCount = Math.max(0, openCount - 1);
    if (openCount === 0) notify();
  };
}

/**
 * Subscribes to open/close transitions (any registered menu going from none
 * open to at least one, or from at least one to none). Returns an
 * unsubscribe function. The listener receives the new state (`true` on the
 * 0→1 transition, `false` on the 1→0 transition) straight from the
 * registry — not `isContextMenuOpen()`, so it's exact even while a closing
 * menu's DOM node hasn't been detached yet.
 */
export function onContextMenuOpenChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Reports whether any context menu is currently open, as tracked by the
 * mount/unmount registry above.
 */
export function isContextMenuOpen(): boolean {
  return openCount > 0;
}

/** Test-only: resets the registry between test files/cases. */
export function _resetContextMenuPresenceForTests(): void {
  openCount = 0;
  listeners.clear();
}
