/**
 * Whether a context menu is currently open, and whether it currently holds
 * focus. Used by hosts (e.g. the timeline's keyboard shortcuts) that must
 * suspend their own key handling while a context menu is open, the same way
 * they already do while a modal is open.
 *
 * `isContextMenuOpen` is the robust check: it doesn't depend on focus, so it
 * still reports `true` in the moment between the search `<input>`
 * unmounting and the menu panel reclaiming focus (e.g. right after Escape
 * clears a search), when a window-capture listener registered before the
 * menu's own would otherwise see focus sitting on `<body>` and act on the
 * keystroke.
 */
export function isContextMenuOpen(doc: Document = document): boolean {
  return doc.querySelector('.context-menu') !== null;
}
