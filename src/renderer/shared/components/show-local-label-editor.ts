import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { LabelEditorDialog } from './label-editor-dialog';

export interface ShowLocalLabelEditorOptions {
  title: string;
  initialValue: string;
  placeholder: string;
  onSave: (value: string) => void;
  onReset: () => void;
}

/**
 * Imperative entry point for callers outside a React tree (e.g. the wiki-link
 * context menu built into a CodeMirror extension). Mirrors `show-label-override-editor.ts`:
 * mounts a fresh root into a `document.body` host and tears it down on close.
 */
export function showLocalLabelEditor(opts: ShowLocalLabelEditorOptions): void {
  const { title, initialValue, placeholder, onSave, onReset } = opts;

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

  root.render(
    createElement(LabelEditorDialog, {
      title,
      initialValue,
      placeholder,
      onSave: (value: string) => {
        onSave(value);
        destroy();
      },
      onReset: () => {
        onReset();
        destroy();
      },
      onClose: destroy,
    }),
  );
}
