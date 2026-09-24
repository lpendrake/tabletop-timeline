import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ContextMenu } from './context-menu';
import type { ContextMenuItem, CaretAnchor, ContextMenuCloseReason } from './types';

export interface ContextMenuHandle {
  close(): void;
}

export interface ShowContextMenuOptions {
  anchor?: CaretAnchor;
  onClose?(reason?: ContextMenuCloseReason): void;
  restoreFocus?: () => void;
  backspaceCloses?: boolean;
}

/**
 * Imperative entry point for callers outside a React tree (e.g. a CodeMirror
 * span's native contextmenu handler). Mirrors `peek/show.ts`: mounts a fresh
 * root into a `document.body` host and tears it down on close.
 *
 * Order on select: `restoreFocus` runs first (or the default previous-focus
 * restore), then the selected item's `onSelect`, then the menu unmounts —
 * so an action that acts on e.g. an editor sees it focused again. See
 * `AGENTS.md`.
 */
export function showContextMenu(
  items: ContextMenuItem[],
  x: number,
  y: number,
  options?: ShowContextMenuOptions,
): ContextMenuHandle {
  const host = document.createElement('div');
  host.style.zIndex = '1500';
  document.body.appendChild(host);
  const root = createRoot(host);

  let destroyed = false;
  function destroy(reason?: ContextMenuCloseReason) {
    if (destroyed) return;
    destroyed = true;
    queueMicrotask(() => {
      root.unmount();
      host.remove();
    });
    options?.onClose?.(reason);
  }

  root.render(
    createElement(ContextMenu, {
      items,
      x,
      y,
      anchor: options?.anchor,
      restoreFocus: options?.restoreFocus,
      backspaceCloses: options?.backspaceCloses,
      onClose: (reason?: ContextMenuCloseReason) => destroy(reason),
    }),
  );

  return {
    close() {
      destroy();
    },
  };
}
