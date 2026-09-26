/**
 * Combines several `EditorMenuExtraItems` functions into one, in order.
 * Pure and framework-free — used to let a host register more than one
 * source of extra editor-menu items (e.g. "New note…" and the Relationships
 * submenu) without either source needing to know about the other.
 */
import type { EditorMenuExtraItems } from './extensions/editor-context-menu';

export function composeExtraItems(
  ...fns: (EditorMenuExtraItems | undefined)[]
): EditorMenuExtraItems {
  return (ctx) => fns.flatMap((fn) => fn?.(ctx) ?? []);
}
