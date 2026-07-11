import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ContextMenu } from './context-menu';
import type { ContextMenuItem } from './types';

export interface ContextMenuHandle {
  close(): void;
}

/**
 * Imperative entry point for callers outside a React tree (e.g. a CodeMirror
 * span's native contextmenu handler). Mirrors `peek/show.ts`: mounts a fresh
 * root into a `document.body` host and tears it down on close.
 */
export function showContextMenu(items: ContextMenuItem[], x: number, y: number): ContextMenuHandle {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);

  function destroy() {
    queueMicrotask(() => {
      root.unmount();
      host.remove();
    });
  }

  root.render(
    createElement(ContextMenu, {
      items,
      x,
      y,
      onClose: () => destroy(),
    }),
  );

  return {
    close() {
      destroy();
    },
  };
}
