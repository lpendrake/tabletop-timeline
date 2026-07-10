import type { Extension } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';

export interface PointerGuardOptions {
  /**
   * When true, swallow a plain left pointerdown (no modifier required) on
   * elements matching `selector`, in addition to the Ctrl/Cmd+left-click
   * case. Used by atomic click targets (e.g. the wiki-link rendered name)
   * where a plain click navigates and must never place a text cursor.
   * Defaults to false, preserving the modifier-gated behaviour.
   */
  anyLeftClick?: boolean;
}

/**
 * Returns a CM6 extension that intercepts Ctrl/Cmd+left-click (or, with
 * `anyLeftClick`, any plain left-click) on elements matching `selector` in
 * the capture phase, preventing the default CM6 cursor-placement behaviour
 * while still allowing the subsequent click event to reach the handler that
 * opens the link.
 */
export function makePointerGuard(selector: string, options: PointerGuardOptions = {}): Extension {
  const { anyLeftClick = false } = options;
  return ViewPlugin.fromClass(
    class {
      private readonly onPointerDown = (event: PointerEvent) => {
        if (event.button !== 0) return;
        if (!anyLeftClick && !(event.metaKey || event.ctrlKey)) return;
        const target = event.target as HTMLElement;
        if (!target.closest(selector)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      };

      constructor(readonly view: EditorView) {
        view.dom.addEventListener('pointerdown', this.onPointerDown, true);
      }

      destroy() {
        this.view.dom.removeEventListener('pointerdown', this.onPointerDown, true);
      }
    },
  );
}
