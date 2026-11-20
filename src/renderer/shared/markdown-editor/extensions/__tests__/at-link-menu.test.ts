// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { wikiLinks } from '../wiki-links';
import type { WikiLinkSuggestion } from '../wiki-link-insert';
import { linkMenuItems } from '../at-link-menu';
import { filterMenu } from '../../../context-menu/menu-search';
import type { ContextMenuItem } from '../../../context-menu/types';

const showContextMenuMock = vi.fn();

vi.mock('../../../context-menu', () => ({
  showContextMenu: (...args: unknown[]) => showContextMenuMock(...args),
}));

const NOTE: WikiLinkSuggestion = { id: 'the-claw', label: 'The Claw', detail: 'npcs/claw.md' };
const ASSET: WikiLinkSuggestion = {
  id: '',
  label: 'Map',
  detail: 'assets/map.png',
  assetPath: 'assets/map.png',
};

type Suggest = (query: string) => Promise<WikiLinkSuggestion[]>;

function makeView(
  content: string,
  suggest: Suggest = vi.fn().mockResolvedValue([NOTE, ASSET]),
  extra: Extension[] = [],
): EditorView {
  const state = EditorState.create({
    doc: content,
    extensions: [markdown({ base: markdownLanguage }), wikiLinks({ suggest }), ...extra],
  });
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({ state, parent });
  vi.spyOn(view, 'coordsAtPos').mockReturnValue({
    left: 10,
    right: 20,
    top: 30,
    bottom: 50,
  } as unknown as ReturnType<EditorView['coordsAtPos']>);
  return view;
}

function typeAt(view: EditorView, from: number, to = from): boolean {
  for (const handler of view.state.facet(EditorView.inputHandler)) {
    if (handler(view, from, to, '@', () => false)) return true;
  }
  return false;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function openAt(content: string, pos = content.length) {
  const view = makeView(content);
  view.dispatch({ selection: { anchor: pos } });
  expect(typeAt(view, pos)).toBe(true);
  await flush();
  const call = showContextMenuMock.mock.calls[showContextMenuMock.mock.calls.length - 1];
  return {
    view,
    items: call[0] as ContextMenuItem[],
    options: call[3] as { onClose: (reason: string, query: string) => void } & Record<
      string,
      unknown
    >,
  };
}

describe('at-link-menu', () => {
  beforeEach(() => showContextMenuMock.mockClear());
  afterEach(() => vi.restoreAllMocks());

  it('typing `@` at the start of a line opens the link search instead of inserting `@`', async () => {
    const { view, items, options } = await openAt('');
    expect(view.state.doc.toString()).toBe('');
    expect(items).toHaveLength(2);
    expect(options.backspaceCloses).toBe(true);
    expect(options.escapeLeavesSearch).toBe(false);
    expect(options.spaceCloses).toBe(true);
  });

  it('typing `@` after a space opens the link search', async () => {
    const { view } = await openAt('hello ');
    expect(view.state.doc.toString()).toBe('hello ');
    expect(showContextMenuMock).toHaveBeenCalledTimes(1);
  });

  it('typing `@` inside a word inserts a literal `@`', async () => {
    const view = makeView('me');
    expect(typeAt(view, 2)).toBe(false);
    await flush();
    expect(showContextMenuMock).not.toHaveBeenCalled();
  });

  it('typing `@` inside inline code or an open `[[` query inserts a literal `@`', async () => {
    const code = makeView('`a  b`');
    expect(typeAt(code, 3)).toBe(false);
    const query = makeView('see [[the ');
    expect(typeAt(query, 10)).toBe(false);
    await flush();
    expect(showContextMenuMock).not.toHaveBeenCalled();
  });

  it('picking a note inserts `[[id]]` at the caret', async () => {
    const { view, items, options } = await openAt('hi ');
    (items[0] as { onSelect: () => void }).onSelect();
    options.onClose('select', '');
    expect(view.state.doc.toString()).toBe('hi [[the-claw]]');
    expect(view.state.selection.main.head).toBe(15);
  });

  it('picking an asset inserts an image link', async () => {
    const { view, items } = await openAt('');
    (items[1] as { onSelect: () => void }).onSelect();
    expect(view.state.doc.toString()).toBe('![Map](notes-asset://current/assets/map.png)');
  });

  it('Escape leaves `@query` with the query selected', async () => {
    const { view, options } = await openAt('hi ');
    options.onClose('escape', 'cla');
    expect(view.state.doc.toString()).toBe('hi @cla');
    expect(view.state.selection.main.from).toBe(4);
    expect(view.state.selection.main.to).toBe(7);
  });

  it('clicking outside leaves `@query` with the query selected', async () => {
    const { view, options } = await openAt('hi ');
    options.onClose('outside', 'cla');
    expect(view.state.doc.toString()).toBe('hi @cla');
    expect(view.state.selection.main.from).toBe(4);
    expect(view.state.selection.main.to).toBe(7);
  });

  it('Escape with no query leaves `@` with the caret after it', async () => {
    const { view, options } = await openAt('hi ');
    options.onClose('escape', '');
    expect(view.state.doc.toString()).toBe('hi @');
    expect(view.state.selection.main.empty).toBe(true);
    expect(view.state.selection.main.head).toBe(4);
  });

  it('a space straight after `@` types `@ `', async () => {
    const { view, options } = await openAt('hi ');
    options.onClose('space', '');
    expect(view.state.doc.toString()).toBe('hi @ ');
    expect(view.state.selection.main.head).toBe(5);
  });

  it('Backspace closes the search and leaves nothing', async () => {
    const { view, options } = await openAt('hi ');
    options.onClose('backspace', '');
    expect(view.state.doc.toString()).toBe('hi ');
  });

  it('with nothing to link, `@` types a literal `@`', async () => {
    const view = makeView('hi ', vi.fn().mockResolvedValue([]));
    view.dispatch({ selection: { anchor: 3 } });
    expect(typeAt(view, 3)).toBe(true);
    await flush();
    expect(showContextMenuMock).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).toBe('hi @');
    expect(view.state.selection.main.head).toBe(4);
  });

  it('if the text changes before suggestions arrive, `@` types a literal `@`', async () => {
    let resolve!: (v: WikiLinkSuggestion[]) => void;
    const deferred = new Promise<WikiLinkSuggestion[]>((r) => (resolve = r));
    const view = makeView('hi ', () => deferred);
    view.dispatch({ selection: { anchor: 3 } });
    expect(typeAt(view, 3)).toBe(true);
    view.dispatch({ changes: { from: 3, insert: 'x' }, selection: { anchor: 4 } });
    resolve([NOTE]);
    await flush();
    expect(showContextMenuMock).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).toBe('hi x@');
    expect(view.state.selection.main.head).toBe(5);
  });

  it('if suggestions fail, `@` types a literal `@`', async () => {
    const view = makeView('hi ', vi.fn().mockRejectedValue(new Error('boom')));
    view.dispatch({ selection: { anchor: 3 } });
    expect(typeAt(view, 3)).toBe(true);
    await flush();
    expect(showContextMenuMock).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).toBe('hi @');
    expect(view.state.selection.main.head).toBe(4);
  });

  it('`@` with text selected types normally', async () => {
    const view = makeView('hi there');
    expect(typeAt(view, 3, 8)).toBe(false);
    await flush();
    expect(showContextMenuMock).not.toHaveBeenCalled();
  });

  it('`@` in a read-only editor does nothing special', async () => {
    const view = makeView('hi ', undefined, [EditorState.readOnly.of(true)]);
    expect(typeAt(view, 3)).toBe(false);
    await flush();
    expect(showContextMenuMock).not.toHaveBeenCalled();
  });

  it('`@` inside a URL types a literal `@`', async () => {
    const view = makeView('[a b](http://x.com)');
    expect(typeAt(view, 3)).toBe(false);
    await flush();
    expect(showContextMenuMock).not.toHaveBeenCalled();
  });

  it('picking a note when `]]` follows the caret absorbs it', async () => {
    const { view, items } = await openAt('hi ]]', 3);
    (items[0] as { onSelect: () => void }).onSelect();
    expect(view.state.doc.toString()).toBe('hi [[the-claw]]');
  });

  it('link menu items match on title, id and path', () => {
    const items = linkMenuItems([NOTE, ASSET], () => {});
    const labels = (q: string) =>
      filterMenu(items, q).targets.map((t) => t.labels[t.labels.length - 1]);
    expect(labels('claw')).toEqual(['The Claw']);
    expect(labels('the-claw')).toEqual(['The Claw']);
    expect(labels('npcs/')).toEqual(['The Claw']);
    expect(labels('map.png')).toEqual(['Map']);
  });
});
