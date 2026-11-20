/**
 * The `@` link search. Typing `@` at a word boundary (the same trigger rule
 * as the `/` menu — see `slash-trigger.ts`) holds the `@` back and opens a
 * caret-anchored menu of linkable notes and assets; the menu's own
 * type-to-search filters it.
 *
 *  - Enter inserts the link (`[[id]]`, or image markdown for an asset).
 *  - Escape or clicking outside types `@<query>` into the document with the
 *    query selected so typing replaces it; with no query it leaves a plain
 *    `@` and the caret after it.
 *  - A space straight after `@` types a literal `@ `.
 *  - With nothing to link, or if the lookup fails or the text changes first,
 *    a literal `@` is typed instead of opening the menu.
 *  - Backspace before any search closes the menu and leaves nothing.
 */
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type { ContextMenuItem, ContextMenuCloseReason } from '../../context-menu';
import { openCaretMenu, triggerReinsertChange, typedTextChange } from './editor-context-menu';
import { isCaretMenuTrigger } from './slash-trigger';
import { buildWikiLinkInsert, type WikiLinkSuggestion } from './wiki-link-insert';

const AT = '@';

/** One menu action per suggestion; matches on title, id and path. */
export function linkMenuItems(
  suggestions: WikiLinkSuggestion[],
  onPick: (s: WikiLinkSuggestion) => void,
): ContextMenuItem[] {
  return suggestions.map((s) => ({
    kind: 'action',
    label: s.label,
    keywords: [s.id, s.detail].filter((k): k is string => !!k),
    onSelect: () => onPick(s),
  }));
}

function pickLink(view: EditorView, pos: number, s: WikiLinkSuggestion): void {
  const doc = view.state.doc;
  const { insert, replaceFrom, replaceTo } = buildWikiLinkInsert(
    s,
    pos,
    pos,
    doc.sliceString(pos, pos + 2),
  );
  view.dispatch({
    changes: { from: replaceFrom, to: replaceTo, insert },
    selection: { anchor: replaceFrom + insert.length },
    userEvent: 'input.complete',
  });
}

/** Types a literal `@` at the caret (the held-back keypress, when no menu opens). */
function insertLiteralAt(view: EditorView): void {
  const pos = view.state.selection.main.head;
  view.dispatch({ ...triggerReinsertChange(pos, AT, ''), userEvent: 'input.type' });
}

// The menu restores focus to the view before it reports any close reason.
function closeAtMenu(
  view: EditorView,
  reason: ContextMenuCloseReason | undefined,
  query: string,
): void {
  if (!view.dom.isConnected) return;
  const pos = view.state.selection.main.head;
  if (reason === 'escape' || reason === 'outside') {
    view.dispatch({ ...triggerReinsertChange(pos, AT, query), userEvent: 'input.type' });
  } else if (reason === 'space') {
    view.dispatch({ ...typedTextChange(pos, `${AT} `), userEvent: 'input.type' });
  }
  // 'backspace': the '@' was never inserted. 'select': the link is already in.
}

/** The suggestions for an empty query, or null when the lookup fails. */
async function fetchSuggestions(
  suggest: (query: string) => Promise<WikiLinkSuggestion[]>,
): Promise<WikiLinkSuggestion[] | null> {
  try {
    return await suggest('');
  } catch {
    return null;
  }
}

/**
 * Opens the menu once suggestions arrive. Types a literal `@` instead when
 * there is nothing to link, the lookup failed, the document or selection
 * changed meanwhile, or the menu cannot be anchored.
 */
async function openAtMenu(
  view: EditorView,
  suggest: (query: string) => Promise<WikiLinkSuggestion[]>,
): Promise<void> {
  const before = view.state;
  const suggestions = await fetchSuggestions(suggest);
  if (!view.dom.isConnected) return;
  if (suggestions && suggestions.length > 0 && view.state === before) {
    const items = linkMenuItems(suggestions, (s) =>
      pickLink(view, view.state.selection.main.head, s),
    );
    const opened = openCaretMenu(view, before.selection.main.head, items, {
      backspaceCloses: true,
      escapeLeavesSearch: false,
      spaceCloses: true,
      onClose: (reason, query) => closeAtMenu(view, reason, query),
    });
    if (opened) return;
  }
  insertLiteralAt(view);
}

export function atLinkInputHandler(
  suggest: (query: string) => Promise<WikiLinkSuggestion[]>,
): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (text !== AT || from !== to) return false;
    if (view.state.readOnly || !view.state.facet(EditorView.editable)) return false;
    if (!isCaretMenuTrigger(view.state, from)) return false;

    void openAtMenu(view, suggest);
    return true;
  });
}
