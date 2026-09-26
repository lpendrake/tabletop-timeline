/**
 * Context menu for plain markdown editor text (i.e. not a wiki-link — see
 * `wiki-links.ts`'s `makeWikiLinkContextMenuHandler`, which owns right-clicks
 * on `.cm-note-link` spans and is registered ahead of this extension so it
 * gets first refusal on the `contextmenu` event).
 *
 * The same menu (any host-supplied extra items first, then a Formatting
 * submenu, then Copy, Paste, Delete) can be opened three ways:
 *  - Right-click, at the pointer.
 *  - Typing `/` at a word boundary (start of line or after whitespace, and
 *    not inside code / a wiki-link query / a URL), anchored at the caret's
 *    line. The `/` is held back while the menu is open; Escape re-inserts a
 *    literal `/`, Backspace drops it, and choosing an action runs it in
 *    place of the `/`.
 *  - Shift+F10 or the ContextMenu key, anchored at the caret, acting on the
 *    current selection (like a right-click at the caret would).
 *
 * For read-only editors (expanded event card preview, peek, etc.): this
 * extension shows no menu of its own. It only suppresses the native OS menu
 * and lets the event bubble up (no `stopPropagation()`), so a read-only
 * host's own `onContextMenu` (e.g. the card's Edit/Delete menu) can handle
 * it instead. The `/` trigger and the Shift+F10/ContextMenu keymap are both
 * no-ops when the editor isn't editable.
 */
import { Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap, type Command } from '@codemirror/view';
import {
  showContextMenu,
  type ContextMenuItem,
  type ContextMenuCloseReason,
} from '../../context-menu';
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
  toggleHeadingLevel1Command,
  toggleHeadingLevel2Command,
  toggleHeadingLevel3Command,
} from '../commands';
import { shouldOpenSlashMenu } from './slash-trigger';

export interface EditorMenuContext {
  view: EditorView;
  from: number;
  to: number;
  selectedText: string;
  /** Dispatches a change replacing [from, to) with `text`, caret after it, then refocuses the view. */
  replaceRange(text: string): void;
}

export type EditorMenuExtraItems = (ctx: EditorMenuContext) => ContextMenuItem[];

export interface EditorContextMenuConfig {
  /** When true, shows no menu — only suppresses the native OS menu and lets the event bubble to the host. */
  readOnly?: boolean;
  /**
   * Host-supplied items, appended to both the right-click and `/` menus.
   * Read lazily each time a menu opens, so the base extension layer can be
   * built once while the host's latest callback is used.
   */
  getExtraItems?: () => EditorMenuExtraItems | undefined;
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

function makeMenuContext(view: EditorView, from: number, to: number): EditorMenuContext {
  return {
    view,
    from,
    to,
    selectedText: view.state.doc.sliceString(from, to),
    replaceRange(text: string) {
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
        userEvent: 'input.type',
      });
      view.focus();
    },
  };
}

/**
 * Builds the standard editor menu for the given range: any host-supplied
 * extra items first (with a trailing separator, only when there are some),
 * then the Formatting submenu, then a separator, then Copy, Paste, Delete.
 */
export function buildEditorMenuItems(
  view: EditorView,
  range: { from: number; to: number },
  extraItems?: EditorMenuExtraItems,
): ContextMenuItem[] {
  const { from, to } = range;
  const hasSelection = from !== to;
  const docText = view.state.doc.toString();

  const items: ContextMenuItem[] = [];

  const extra = extraItems?.(makeMenuContext(view, from, to)) ?? [];
  if (extra.length > 0) {
    items.push(...extra);
    items.push({ kind: 'separator' });
  }

  items.push(
    {
      kind: 'submenu',
      label: 'Formatting',
      items: [
        {
          kind: 'submenu',
          label: 'Heading',
          items: [
            {
              kind: 'action',
              label: 'Heading 1',
              keywords: ['h1', 'title'],
              onSelect: () => runFormat(view, toggleHeadingLevel1Command),
            },
            {
              kind: 'action',
              label: 'Heading 2',
              keywords: ['h2'],
              onSelect: () => runFormat(view, toggleHeadingLevel2Command),
            },
            {
              kind: 'action',
              label: 'Heading 3',
              keywords: ['h3'],
              onSelect: () => runFormat(view, toggleHeadingLevel3Command),
            },
          ],
        },
        {
          kind: 'action',
          label: 'Bold',
          keywords: ['strong'],
          onSelect: () => runFormat(view, boldCommand),
        },
        { kind: 'action', label: 'Italic', onSelect: () => runFormat(view, italicCommand) },
        {
          kind: 'action',
          label: 'Code',
          keywords: ['inline code'],
          onSelect: () => runFormat(view, codeCommand),
        },
        {
          kind: 'action',
          label: 'Strikethrough',
          onSelect: () => runFormat(view, strikeCommand),
        },
        {
          kind: 'action',
          label: 'Bullet list',
          keywords: ['ul'],
          onSelect: () => runFormat(view, bulletListCommand),
        },
        {
          kind: 'action',
          label: 'Numbered list',
          keywords: ['ol'],
          onSelect: () => runFormat(view, orderedListCommand),
        },
        {
          kind: 'action',
          label: 'Blockquote',
          onSelect: () => runFormat(view, blockquoteCommand),
        },
      ],
    },
    { kind: 'separator' },
    {
      kind: 'action',
      label: 'Copy',
      onSelect: () => {
        void copyToClipboard(resolveCopyTarget(docText, from, to));
      },
    },
    {
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
    },
    {
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
    },
  );

  return items;
}

/**
 * Rect shape returned by `view.coordsAtPos` — also what our line-block
 * fallback below produces.
 */
export interface CaretRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Resolves a caret rect for `pos` that's always usable, even when
 * `EditorView.coordsAtPos` can't measure one.
 *
 * `coordsAtPos` measures from the DOM text node touching `pos`. At the
 * start of an *empty* line (a brand-new blank line, an empty document, or
 * the line right after a blank one) there is no such text node — CodeMirror
 * renders an empty line as an unmeasurable point — so `coordsAtPos` returns
 * `null` for both caret sides (`1` and `-1`) there. That's exactly the case
 * that made typing `/` at the start of an empty line silently insert a
 * literal `/` instead of opening the menu: `openCaretMenu` bailed out on the
 * null result and the input handler let the character through.
 *
 * When both sides come back null, we fall back to the line's block geometry
 * (`lineBlockAt` + `documentTop`, which together give screen-space
 * top/bottom for the line even when it holds no measurable content) for
 * vertical position, and the content box's left edge plus its CSS padding
 * for horizontal position — which is exactly where the caret sits at the
 * start of a line with no indentation.
 */
export function getCaretRect(view: EditorView, pos: number): CaretRect | null {
  const direct = view.coordsAtPos(pos, 1) ?? view.coordsAtPos(pos, -1);
  if (direct) return direct;

  const line = view.lineBlockAt(pos);
  const top = view.documentTop + line.top;
  const bottom = view.documentTop + line.bottom;
  const contentRect = view.contentDOM.getBoundingClientRect();
  const paddingLeft = parseFloat(getComputedStyle(view.contentDOM).paddingLeft || '0') || 0;
  const left = contentRect.left + paddingLeft;

  return { left, right: left, top, bottom };
}

/** Opens the menu anchored at the caret (shared by the `/` trigger and Shift+F10/ContextMenu). */
function openCaretMenu(
  view: EditorView,
  range: { from: number; to: number },
  config: EditorContextMenuConfig,
  extraOptions: { backspaceCloses?: boolean; onClose?: (reason?: ContextMenuCloseReason) => void },
): boolean {
  const coords = getCaretRect(view, range.from);
  if (!coords) return false;

  const lineRect = {
    left: coords.left,
    right: coords.right,
    top: coords.top,
    bottom: coords.bottom,
    width: coords.right - coords.left,
    height: coords.bottom - coords.top,
  };
  const items = buildEditorMenuItems(view, range, config.getExtraItems?.());

  showContextMenu(items, coords.left, coords.bottom, {
    anchor: { lineRect, prefer: 'below' },
    restoreFocus: () => view.focus(),
    backspaceCloses: extraOptions.backspaceCloses,
    onClose: extraOptions.onClose,
  });

  return true;
}

function isEditable(view: EditorView, config: EditorContextMenuConfig): boolean {
  return !view.state.readOnly && !config.readOnly;
}

function makeSlashInputHandler(config: EditorContextMenuConfig): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (text !== '/') return false;
    if (from !== to) return false;
    if (!isEditable(view, config)) return false;
    if (!shouldOpenSlashMenu(view.state, from)) return false;

    const opened = openCaretMenu(view, { from, to: from }, config, {
      backspaceCloses: true,
      onClose: (reason) => {
        if (!view.dom.isConnected) return;
        if (reason === 'escape' || reason === 'outside') {
          const pos = view.state.selection.main.head;
          view.dispatch({
            changes: { from: pos, insert: '/' },
            selection: { anchor: pos + 1 },
            userEvent: 'input.type',
          });
          if (reason === 'escape') view.focus();
        }
        // 'backspace': the '/' was never inserted — nothing to do.
        // 'select': the chosen action already ran in place of the '/'.
      },
    });

    // Return true to hold the '/' back (don't insert it) — whether or not
    // the menu actually opened; openCaretMenu only returns false in the
    // (practically unreachable) case where getCaretRect can't resolve any
    // rect at all, and we fall through to letting '/' type normally then.
    return opened;
  });
}

function makeCaretMenuKeymap(config: EditorContextMenuConfig): Extension {
  const run: Command = (view) => {
    if (!isEditable(view, config)) return false;
    const range = view.state.selection.main;
    return openCaretMenu(view, { from: range.from, to: range.to }, config, {});
  };

  return Prec.high(
    keymap.of([
      { key: 'Shift-F10', run },
      { key: 'ContextMenu', run },
    ]),
  );
}

export function editorContextMenu(config: EditorContextMenuConfig = {}): Extension {
  return [
    EditorView.domEventHandlers({
      contextmenu(event, view) {
        const target = event.target as HTMLElement;
        if (target.closest('.cm-note-link')) return false;

        if (config.readOnly) {
          // Suppress the native OS menu, but don't stopPropagation — let the
          // event bubble so a read-only host (e.g. an event card) can show
          // its own context menu instead.
          event.preventDefault();
          return true;
        }

        event.preventDefault();
        event.stopPropagation();

        const range = resolveTargetRange(view, event);
        const items = buildEditorMenuItems(view, range, config.getExtraItems?.());

        showContextMenu(items, event.clientX, event.clientY, {
          restoreFocus: () => view.focus(),
        });
        return true;
      },
    }),
    makeSlashInputHandler(config),
    makeCaretMenuKeymap(config),
  ];
}
