// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  editorContextMenu,
  buildEditorMenuItems,
  type EditorMenuExtraItems,
} from '../editor-context-menu';
import { filterMenu, pickAutoTarget } from '../../../context-menu/menu-search';
import type { ContextMenuItem } from '../../../context-menu/types';

const showContextMenuMock = vi.fn();

vi.mock('../../../context-menu', () => ({
  showContextMenu: (...args: unknown[]) => showContextMenuMock(...args),
}));

function makeView(
  content: string,
  options: { readOnly?: boolean; extraItems?: EditorMenuExtraItems } = {},
): EditorView {
  const extensions = [
    markdown({ base: markdownLanguage }),
    editorContextMenu({
      readOnly: options.readOnly,
      getExtraItems: options.extraItems ? () => options.extraItems : undefined,
    }),
  ];
  if (options.readOnly) {
    extensions.push(EditorState.readOnly.of(true));
  }
  const state = EditorState.create({ doc: content, extensions });
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({ state, parent });
}

/** Simulates typing `/` via the registered input handlers, mirroring how CM6 dispatches beforeinput. */
function typeSlash(view: EditorView, from: number, to = from): boolean {
  const handlers = view.state.facet(EditorView.inputHandler);
  for (const handler of handlers) {
    if (handler(view, from, to, '/', () => false)) return true;
  }
  return false;
}

function stubCoords(view: EditorView, rect = { left: 10, right: 20, top: 30, bottom: 50 }) {
  vi.spyOn(view, 'coordsAtPos').mockImplementation(
    () => rect as unknown as ReturnType<EditorView['coordsAtPos']>,
  );
}

function lastShowContextMenuCall() {
  const call = showContextMenuMock.mock.calls[showContextMenuMock.mock.calls.length - 1];
  return { items: call[0] as ContextMenuItem[], x: call[1], y: call[2], options: call[3] };
}

function fireContextMenuEvent(view: EditorView, x = 5, y = 5, clickPos: number | null = null) {
  vi.spyOn(view, 'posAtCoords').mockReturnValue(clickPos);
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  });
  view.contentDOM.dispatchEvent(event);
}

describe('editorContextMenu', () => {
  beforeEach(() => {
    showContextMenuMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('typing / at line start holds it back and opens the menu at the caret', () => {
    const view = makeView('');
    stubCoords(view);

    const handled = typeSlash(view, 0);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('');
    expect(showContextMenuMock).toHaveBeenCalledTimes(1);

    const { options } = lastShowContextMenuCall();
    expect(options.anchor).toBeDefined();
    expect(options.anchor.prefer).toBe('below');
    expect(options.backspaceCloses).toBe(true);
  });

  it('Escape leaves a literal /', () => {
    const view = makeView('');
    stubCoords(view);
    typeSlash(view, 0);

    const { options } = lastShowContextMenuCall();
    options.onClose('escape');

    expect(view.state.doc.toString()).toBe('/');
    expect(view.state.selection.main.head).toBe(1);
  });

  it('Backspace leaves nothing', () => {
    const view = makeView('');
    stubCoords(view);
    typeSlash(view, 0);

    const { options } = lastShowContextMenuCall();
    options.onClose('backspace');

    expect(view.state.doc.toString()).toBe('');
  });

  it('a chosen action runs in place of the /', () => {
    const view = makeView('');
    stubCoords(view);
    typeSlash(view, 0);

    const { items, options } = lastShowContextMenuCall();
    const formatting = items.find(
      (i) => i.kind === 'submenu' && i.label === 'Formatting',
    ) as Extract<ContextMenuItem, { kind: 'submenu' }>;
    const heading = formatting.items.find(
      (i) => i.kind === 'submenu' && i.label === 'Heading',
    ) as Extract<ContextMenuItem, { kind: 'submenu' }>;
    const h1 = heading.items.find((i) => i.kind === 'action' && i.label === 'Heading 1') as Extract<
      ContextMenuItem,
      { kind: 'action' }
    >;

    h1.onSelect();
    options.onClose('select');

    expect(view.state.doc.toString()).not.toContain('/');
    expect(view.state.doc.toString().startsWith('#')).toBe(true);
  });

  it('does not open in a read-only editor', () => {
    const view = makeView('', { readOnly: true });
    stubCoords(view);

    const handled = typeSlash(view, 0);

    expect(handled).toBe(false);
    expect(showContextMenuMock).not.toHaveBeenCalled();
  });

  it('does not open when replacing a selection', () => {
    const view = makeView('abc');
    stubCoords(view);

    const handled = typeSlash(view, 0, 3);

    expect(handled).toBe(false);
    expect(showContextMenuMock).not.toHaveBeenCalled();
  });

  it('host extra items appear for right-click and /', () => {
    let capturedText = '';
    const extraItems: EditorMenuExtraItems = (ctx) => [
      {
        kind: 'action',
        label: 'Custom action',
        onSelect: () => {
          capturedText = ctx.selectedText;
          ctx.replaceRange('REPLACED');
        },
      },
    ];

    const view = makeView('hello', { extraItems });
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    stubCoords(view);

    fireContextMenuEvent(view, 5, 5, 2);
    const rightClickCall = lastShowContextMenuCall();
    const rightClickCustom = rightClickCall.items.find(
      (i) => i.kind === 'action' && i.label === 'Custom action',
    ) as Extract<ContextMenuItem, { kind: 'action' }>;
    expect(rightClickCustom).toBeDefined();
    expect(rightClickCall.items[rightClickCall.items.length - 2]).toEqual({ kind: 'separator' });

    rightClickCustom.onSelect();
    expect(capturedText).toBe('hello');
    expect(view.state.doc.toString()).toBe('REPLACED');

    showContextMenuMock.mockClear();
    const view2 = makeView('', { extraItems });
    stubCoords(view2);
    typeSlash(view2, 0);
    const slashCall = lastShowContextMenuCall();
    const slashCustom = slashCall.items.find(
      (i) => i.kind === 'action' && i.label === 'Custom action',
    );
    expect(slashCustom).toBeDefined();
  });

  it('Shift-F10 opens the menu at the caret without backspaceCloses', () => {
    const view = makeView('hello');
    stubCoords(view);

    const event = new KeyboardEvent('keydown', {
      key: 'F10',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    view.contentDOM.dispatchEvent(event);

    expect(showContextMenuMock).toHaveBeenCalledTimes(1);
    const { options } = lastShowContextMenuCall();
    expect(options.anchor).toBeDefined();
    expect(options.backspaceCloses).toBeUndefined();
  });

  it('right-click passes restoreFocus that focuses the view', () => {
    const view = makeView('hello');
    const focusSpy = vi.spyOn(view, 'focus').mockImplementation(() => {});

    fireContextMenuEvent(view);

    const { options } = lastShowContextMenuCall();
    options.restoreFocus();

    expect(focusSpy).toHaveBeenCalled();
  });

  it('formatting items are searchable by keyword', () => {
    const view = makeView('hello');
    const items = buildEditorMenuItems(view, { from: 0, to: 0 });

    const { targets } = filterMenu(items, 'hea');
    const target = pickAutoTarget(targets);

    expect(target).not.toBeNull();
    expect(target!.labels).toEqual(['Formatting', 'Heading', 'Heading 1']);
  });
});
