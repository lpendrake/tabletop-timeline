import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { LabelOverrideEditor } from './label-override-editor';

/**
 * Imperative entry point for callers outside a React tree (e.g. the wiki-link
 * context menu built into a CodeMirror extension). Mirrors `context-menu/show.ts`
 * and `peek/show.ts`: mounts a fresh root into a `document.body` host and tears
 * it down on close.
 */
export function showLabelOverrideEditor(entityId: string, target: 'tagLabel' | 'linkLabel'): void {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.zIndex = '2100';
  document.body.appendChild(host);
  const root = createRoot(host);

  const destroy = () => {
    queueMicrotask(() => {
      root.unmount();
      host.remove();
    });
  };

  root.render(createElement(LabelOverrideEditor, { entityId, target, onClose: destroy }));
}
