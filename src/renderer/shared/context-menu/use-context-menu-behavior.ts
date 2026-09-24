import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ContextMenuCloseReason } from './types';

export interface ContextMenuBehaviorOptions {
  /** Called instead of focusing back the pre-open `document.activeElement`. */
  restoreFocus?: () => void;
  /**
   * Called for every keydown the outside-click/Escape listener sees, before
   * its own Escape handling. Return `true` to mark the key as consumed (the
   * hook then calls `preventDefault`/`stopPropagation`); return `false`/
   * `undefined` to let the key fall through (e.g. so a focused search
   * `<input>` still receives ordinary typing and Backspace).
   */
  onKeyDown?: (e: KeyboardEvent) => boolean;
}

/**
 * The single outside-click / keyboard listener shared by every context
 * menu: viewport-clamped positioning for the root panel, closing on an
 * outside `mousedown` or on Escape, and returning focus to wherever it was
 * before the menu opened (or to `options.restoreFocus`, if given) once the
 * menu unmounts.
 *
 * All other menu keys (arrows, Enter, printable characters that start a
 * search, Backspace) are decided by the caller via `options.onKeyDown` —
 * this hook only owns the single `window` capture listener and the
 * prevent/stop contract, not the decision logic.
 */
export function useContextMenuBehavior(
  x: number,
  y: number,
  onClose: (reason?: ContextMenuCloseReason) => void,
  options?: ContextMenuBehaviorOptions,
) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  const previousActiveRef = useRef<Element | null>(null);
  const restoredRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Capture what had focus before the menu opened, and take focus ourselves.
  useLayoutEffect(() => {
    previousActiveRef.current = document.activeElement;
    menuRef.current?.focus({ preventScroll: true });
    // Only ever on mount.
  }, []);

  const restoreFocusNow = useCallback(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const restore = optionsRef.current?.restoreFocus;
    if (restore) {
      restore();
      return;
    }
    const prev = previousActiveRef.current as HTMLElement | null;
    if (prev && document.contains(prev)) {
      prev.focus?.({ preventScroll: true });
    }
  }, []);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      x: Math.min(x, window.innerWidth - rect.width - 8),
      y: Math.min(y, window.innerHeight - rect.height - 8),
    });
  }, [x, y]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        restoreFocusNow();
        onClose('outside');
      }
    }
    function onKey(e: KeyboardEvent) {
      const handled = optionsRef.current?.onKeyDown?.(e);
      if (handled) {
        e.preventDefault();
        // Consume during window-capture, before it reaches any
        // document-capture listener (e.g. a modal's own Escape handler), so
        // a key the menu handles never also fires something behind it.
        e.stopPropagation();
        return;
      }
      if (e.key === 'Escape') {
        e.stopPropagation();
        restoreFocusNow();
        onClose('escape');
      }
    }
    document.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose, restoreFocusNow]);

  // Fallback: if nothing explicitly restored focus (e.g. a close reason the
  // caller didn't intercept), do it on unmount.
  useEffect(() => {
    return () => {
      restoreFocusNow();
    };
  }, [restoreFocusNow]);

  return { menuRef, pos, restoreFocusNow };
}
