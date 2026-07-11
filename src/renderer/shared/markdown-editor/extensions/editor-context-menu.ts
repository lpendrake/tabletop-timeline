/**
 * Right-click context menu for plain markdown editor text (i.e. not a
 * wiki-link — see `wiki-links.ts`'s `makeWikiLinkContextMenuHandler`, which
 * owns right-clicks on `.cm-note-link` spans and is registered ahead of this
 * extension so it gets first refusal on the `contextmenu` event).
 *
 * Offers Copy (always), and — for editable (non-read-only) editors — Paste,
 * Delete, and a Formatting submenu, all operating on the current selection
 * or, if there is none, the line under the click.
 */
import { type Extension } from '@codemirror/state';
import { EditorView, type Command } from '@codemirror/view';
import { showContextMenu, type ContextMenuItem } from '../../context-menu';
import '../../context-menu/context-menu.css';
import { copyToClipboard, readFromClipboard } from '../../clipboard';
import { resolveCopyTarget } from '../domain/markdown/copy-target';
import {
  boldCommand,
  italicCommand,
  codeCommand,
  strikeCommand,
  bulletListCommand,
  orderedListCommand,
  blockquoteCommand,
  setHeadingLevel1Command,
  setHeadingLevel2Command,
  setHeadingLevel3Command,
} from '../commands';

export interface EditorContextMenuConfig {
  /** When true, hides Paste / Delete / Formatting — Copy only. */
  readOnly?: boolean;
}

/** Runs a CM6 Command against the view, then restores focus (mirrors format-toolbar's `run`). */
function runFormat(view: EditorView, cmd: Command): void {
  cmd(view);
  view.focus();
}

/**
 * Resolves the range the menu should act on: the live selection if the
 * click landed inside it (or there's no click position to check), otherwise
 * a caret at the click point.
 */
function resolveTargetRange(view: EditorView, event: MouseEvent): { from: number; to: number } {
  const sel = view.state.selection.main;
  const clickPos = view.posAtCoords({ x: event.clientX, y: event.clientY });

  if (!sel.empty && clickPos !== null && clickPos >= sel.from && clickPos <= sel.to) {
    return { from: sel.from, to: sel.to };
  }

  const pos = clickPos ?? sel.head;
  return { from: pos, to: pos };
}

export function editorContextMenu(config: EditorContextMenuConfig = {}): Extension {
  return EditorView.domEventHandlers({
    contextmenu(event, view) {
      const target = event.target as HTMLElement;
      if (target.closest('.cm-note-link')) return false;

      event.preventDefault();

      const { from, to } = resolveTargetRange(view, event);
      const hasSelection = from !== to;
      const docText = view.state.doc.toString();

      const items: ContextMenuItem[] = [
        {
          kind: 'action',
          label: 'Copy',
          onSelect: () => {
            void copyToClipboard(resolveCopyTarget(docText, from, to));
          },
        },
      ];

      if (!config.readOnly) {
        items.push({
          kind: 'action',
          label: 'Paste',
          onSelect: () => {
            readFromClipboard()
              .then((clipboardText) => {
                if (!clipboardText) return;
                view.dispatch({
                  changes: { from, to, insert: clipboardText },
                  selection: { anchor: from + clipboardText.length },
                  userEvent: 'input.paste',
                });
                view.focus();
              })
              .catch((err: unknown) => console.error('readFromClipboard failed', err));
          },
        });

        items.push({
          kind: 'action',
          label: 'Delete',
          disabled: !hasSelection,
          onSelect: () => {
            view.dispatch({
              changes: { from, to, insert: '' },
              selection: { anchor: from },
              userEvent: 'delete',
            });
            view.focus();
          },
        });

        items.push({ kind: 'separator' });

        items.push({
          kind: 'submenu',
          label: 'Formatting',
          items: [
            {
              kind: 'submenu',
              label: 'Heading',
              items: [
                {
                  kind: 'action',
                  label: 'H1',
                  onSelect: () => runFormat(view, setHeadingLevel1Command),
                },
                {
                  kind: 'action',
                  label: 'H2',
                  onSelect: () => runFormat(view, setHeadingLevel2Command),
                },
                {
                  kind: 'action',
                  label: 'H3',
                  onSelect: () => runFormat(view, setHeadingLevel3Command),
                },
              ],
            },
            { kind: 'action', label: 'Bold', onSelect: () => runFormat(view, boldCommand) },
            { kind: 'action', label: 'Italic', onSelect: () => runFormat(view, italicCommand) },
            { kind: 'action', label: 'Code', onSelect: () => runFormat(view, codeCommand) },
            {
              kind: 'action',
              label: 'Strikethrough',
              onSelect: () => runFormat(view, strikeCommand),
            },
            {
              kind: 'action',
              label: 'Bullet list',
              onSelect: () => runFormat(view, bulletListCommand),
            },
            {
              kind: 'action',
              label: 'Numbered list',
              onSelect: () => runFormat(view, orderedListCommand),
            },
            {
              kind: 'action',
              label: 'Blockquote',
              onSelect: () => runFormat(view, blockquoteCommand),
            },
          ],
        });
      }

      showContextMenu(items, event.clientX, event.clientY);
      return true;
    },
  });
}
