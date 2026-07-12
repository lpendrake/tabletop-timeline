import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function useContextMenuBehavior(x: number, y: number, onClose: () => void) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

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
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Consume the event during window-capture, before it reaches any
        // document-capture listener (e.g. a modal's own Escape handler), so
        // Escape closes only this menu and not something behind it.
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  return { menuRef, pos };
}
