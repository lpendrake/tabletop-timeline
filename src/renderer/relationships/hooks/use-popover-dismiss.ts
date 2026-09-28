import { useEffect, useRef, type RefObject } from 'react';

/**
 * While `open`, closes on Escape (returning focus to `triggerRef`) and on a
 * mousedown outside both the popover and its trigger.
 */
export function usePopoverDismiss(
  open: boolean,
  onClose: () => void,
  popoverRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>,
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      onCloseRef.current();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onCloseRef.current();
      triggerRef.current?.focus({ preventScroll: true });
    }
    document.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, popoverRef, triggerRef]);
}
