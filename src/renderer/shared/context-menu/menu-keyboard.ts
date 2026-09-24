/**
 * Pure keyboard/search state machine for `<ContextMenu>`. No React, no DOM —
 * `context-menu.tsx` holds this as a single `useState<MenuKeyState>` and
 * wires `menuKeyDown`/`menuQueryChange`/`menuHover`/`menuSearchHover` to
 * React state and to the two side effects a keystroke can request
 * (`MenuEffect`: run an action, or close the menu on Backspace).
 */
import { wrapIndex } from '../search/wrap-index';
import {
  firstNavigableIndex,
  firstNonDangerNavigableIndex,
  itemAtPath,
  itemsAtPath,
  nextNavigableIndex,
  pathsEqual,
} from './menu-navigation';
import { filterMenu, pickAutoTarget, type FilterMenuResult } from './menu-search';
import type { ContextMenuItem } from './types';

const emptyFiltered: FilterMenuResult = { visible: [], targets: [] };

export interface MenuKeyState {
  highlightPath: number[] | null;
  isSearching: boolean;
  query: string;
  targetIndex: number;
  preSearchHighlight: number[] | null;
  /**
   * The filtered tree + targets for the current `query`, computed here (the
   * single source of truth) whenever the query changes. `context-menu.tsx`
   * renders from this instead of recomputing `filterMenu` itself, so the
   * targets it renders and the targets `targetIndex` indexes into can never
   * drift apart.
   */
  filtered: FilterMenuResult;
}

export const initialMenuKeyState: MenuKeyState = {
  highlightPath: null,
  isSearching: false,
  query: '',
  targetIndex: -1,
  preSearchHighlight: null,
  filtered: emptyFiltered,
};

/**
 * The state a menu opens with: the first non-danger navigable top-level item
 * (skipping separators, headers, disabled items) is already highlighted, so
 * Enter immediately activates it and Down moves to the next one. A danger
 * item (e.g. "Delete") is never pre-highlighted; if every navigable item is
 * danger, nothing is highlighted. This is also what Escape/backspace-to-empty
 * restore after a search, via `preSearchHighlight`.
 */
export function initialMenuKeyStateFor(items: readonly ContextMenuItem[]): MenuKeyState {
  const index = firstNonDangerNavigableIndex(items);
  return { ...initialMenuKeyState, highlightPath: index === null ? null : [index] };
}

/** A plain description of a keydown — whatever fields the caller reads off the DOM event. */
export interface KeyInput {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/** A side effect a keystroke requests, for the component to carry out. */
export type MenuEffect =
  | { type: 'select'; path: number[] }
  | { type: 'close'; reason: 'backspace' };

export interface MenuKeyResult {
  state: MenuKeyState;
  handled: boolean;
  effect?: MenuEffect;
}

export function isPrintableKey(key: KeyInput): boolean {
  return key.key.length === 1 && !key.ctrlKey && !key.metaKey && !key.altKey;
}

function keyboardOpenPathOf(highlightPath: number[] | null): number[] {
  return highlightPath ? highlightPath.slice(0, -1) : [];
}

function moveHighlight(
  state: MenuKeyState,
  items: readonly ContextMenuItem[],
  dir: 1 | -1,
): MenuKeyState {
  const keyboardOpenPath = keyboardOpenPathOf(state.highlightPath);
  const level = itemsAtPath(items, keyboardOpenPath) ?? items;
  const currentIndex =
    state.highlightPath && state.highlightPath.length === keyboardOpenPath.length + 1
      ? state.highlightPath[state.highlightPath.length - 1]
      : -1;
  const nextIdx = nextNavigableIndex(level, currentIndex, dir);
  if (nextIdx === null) return state;
  return { ...state, highlightPath: [...keyboardOpenPath, nextIdx] };
}

function enterSubmenuAt(
  state: MenuKeyState,
  items: readonly ContextMenuItem[],
  path: number[],
): MenuKeyState {
  const item = itemAtPath(items, path);
  if (!item || item.kind !== 'submenu') return state;
  const firstIdx = firstNavigableIndex(item.items);
  if (firstIdx === null) return state;
  return { ...state, highlightPath: [...path, firstIdx] };
}

function leaveSubmenu(state: MenuKeyState): MenuKeyState {
  const keyboardOpenPath = keyboardOpenPathOf(state.highlightPath);
  if (!state.highlightPath || keyboardOpenPath.length === 0) return state;
  return { ...state, highlightPath: keyboardOpenPath };
}

function activateHighlighted(
  state: MenuKeyState,
  items: readonly ContextMenuItem[],
): { state: MenuKeyState; effect?: MenuEffect } {
  if (!state.highlightPath) return { state };
  const item = itemAtPath(items, state.highlightPath);
  if (!item) return { state };
  if (item.kind === 'action')
    return { state, effect: { type: 'select', path: state.highlightPath } };
  if (item.kind === 'submenu') return { state: enterSubmenuAt(state, items, state.highlightPath) };
  return { state };
}

function retargetedAfter(
  state: MenuKeyState,
  query: string,
  items: readonly ContextMenuItem[],
): MenuKeyState {
  const filtered = filterMenu(items, query);
  const auto = pickAutoTarget(filtered.targets);
  const targetIndex = auto ? filtered.targets.indexOf(auto) : -1;
  return { ...state, query, targetIndex, filtered };
}

function startSearch(
  state: MenuKeyState,
  char: string,
  items: readonly ContextMenuItem[],
): MenuKeyState {
  return retargetedAfter(
    { ...state, isSearching: true, preSearchHighlight: state.highlightPath },
    char,
    items,
  );
}

function exitSearch(state: MenuKeyState): MenuKeyState {
  return {
    highlightPath: state.preSearchHighlight,
    isSearching: false,
    query: '',
    targetIndex: -1,
    preSearchHighlight: null,
    filtered: emptyFiltered,
  };
}

function moveTarget(state: MenuKeyState, dir: 1 | -1): MenuKeyState {
  const n = state.filtered.targets.length;
  if (n === 0) return state;
  const nextIdx = wrapIndex(state.targetIndex, dir, n);
  return { ...state, targetIndex: nextIdx };
}

function activateCurrentTarget(
  state: MenuKeyState,
  items: readonly ContextMenuItem[],
): { state: MenuKeyState; effect?: MenuEffect } {
  const { targets } = state.filtered;
  if (state.targetIndex < 0 || state.targetIndex >= targets.length) return { state };
  const target = targets[state.targetIndex];
  const item = itemAtPath(items, target.path);
  if (item && item.kind === 'action')
    return { state, effect: { type: 'select', path: target.path } };
  return { state };
}

/**
 * Decides what a keydown does. Mirrors the two modes the component renders:
 * while searching, arrows move the target and Enter activates it; otherwise
 * arrows move the highlight and Enter activates/enters it. Printable keys
 * (outside search) start a search; Backspace (outside search) only produces
 * a `close` effect when `opts.backspaceCloses` is set.
 */
export function menuKeyDown(
  state: MenuKeyState,
  key: KeyInput,
  items: readonly ContextMenuItem[],
  opts: { backspaceCloses?: boolean },
): MenuKeyResult {
  if (state.isSearching) {
    switch (key.key) {
      case 'Escape':
        return { state: exitSearch(state), handled: true };
      case 'ArrowDown':
        return { state: moveTarget(state, 1), handled: true };
      case 'ArrowUp':
        return { state: moveTarget(state, -1), handled: true };
      case 'Enter': {
        const result = activateCurrentTarget(state, items);
        return { state: result.state, handled: true, effect: result.effect };
      }
      default:
        // Let printable characters, Backspace, paste, etc. reach the
        // focused search <input> normally.
        return { state, handled: false };
    }
  }

  switch (key.key) {
    case 'ArrowDown':
      return { state: moveHighlight(state, items, 1), handled: true };
    case 'ArrowUp':
      return { state: moveHighlight(state, items, -1), handled: true };
    case 'ArrowRight':
      return {
        state: state.highlightPath ? enterSubmenuAt(state, items, state.highlightPath) : state,
        handled: true,
      };
    case 'ArrowLeft':
      return { state: leaveSubmenu(state), handled: true };
    case 'Enter': {
      const result = activateHighlighted(state, items);
      return { state: result.state, handled: true, effect: result.effect };
    }
    case 'Backspace':
      if (opts.backspaceCloses) {
        return { state, handled: true, effect: { type: 'close', reason: 'backspace' } };
      }
      return { state, handled: false };
    default:
      if (isPrintableKey(key)) {
        return { state: startSearch(state, key.key, items), handled: true };
      }
      return { state, handled: false };
  }
}

/**
 * Handles a change to the search box's value: clearing it exits search
 * (restoring the pre-search highlight, same as Escape); otherwise sets the
 * query and re-targets via `pickAutoTarget`.
 */
export function menuQueryChange(
  state: MenuKeyState,
  value: string,
  items: readonly ContextMenuItem[],
): MenuKeyState {
  if (value === '') return exitSearch(state);
  return retargetedAfter(state, value, items);
}

/** Mouse hover over a row outside search mode: sets the highlight. */
export function menuHover(state: MenuKeyState, path: number[]): MenuKeyState {
  return { ...state, highlightPath: path };
}

/** Mouse hover over a row while searching: sets the target, if it's one of the current matches. */
export function menuSearchHover(state: MenuKeyState, path: number[]): MenuKeyState {
  const idx = state.filtered.targets.findIndex((t) => pathsEqual(t.path, path));
  if (idx === -1) return state;
  return { ...state, targetIndex: idx };
}
