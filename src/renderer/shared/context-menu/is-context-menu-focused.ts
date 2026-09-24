/**
 * True when `doc.activeElement` is inside a context menu panel. Used by
 * hosts (e.g. the timeline's keyboard shortcuts) that must suspend their own
 * key handling while a context menu owns focus, the same way they already
 * do while a modal is open.
 */
export function isContextMenuFocused(doc: Document = document): boolean {
  const active = doc.activeElement;
  if (!active) return false;
  return active.closest('.context-menu') !== null;
}
