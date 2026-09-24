# `src/renderer/shared/context-menu/` — Data-Driven Context Menus (React)

A single reusable context-menu system. Callers configure a menu by passing an
item list (data), not markup. Every menu built on this — event card, note
sidebar, timeline canvas, tag chip, session, wiki-link, editor — gets search
and keyboard navigation for free, with no call-site changes.

## Search and keyboard, built in

- The root panel takes focus when it opens and looks exactly as before —
  **no search row until the user types**.
- The menu opens with the first navigable item already highlighted (skipping
  separators, headers, disabled items), preferring the first **non-danger**
  one — a danger item like Delete is never pre-highlighted, and if every
  navigable item is danger, nothing is. See `initialMenuKeyStateFor` in
  `menu-keyboard.ts`. Escape/backspace-to-empty after searching restore this
  same highlight (`preSearchHighlight`).
- Up/Down move a highlight (skipping separators, headers, disabled items;
  wraps around); Right enters a submenu, Left leaves it; Enter activates the
  highlighted row; mouse hover sets the same highlight, so mouse and
  keyboard always agree.
- Typing a printable character opens a search box above the first item and
  filters the tree: matching actions stay, a submenu stays only if a
  descendant matches (rendered expanded inline, indented, under its label),
  everything else (separators/headers included) is hidden. Ranking is
  `rankMatch` from `shared/search/rank.ts` — prefix, then word-prefix, then
  substring, ties keep menu order. Action items can carry `keywords?:
  string[]` searched alongside the label.
- **Danger items are never the automatic target** — typing "de" and hitting
  Enter can't fire a destructive action by accident. They're only reachable
  by arrowing to them explicitly. Disabled items are never targets either,
  and are hidden while searching.
- Escape while searching closes the search (not the menu) and restores the
  highlight from before the user started typing; a second Escape then closes
  the menu. Backspacing the search box to empty does the same as Escape.
  Escape with no search open closes the menu (`ContextMenuCloseReason`:
  `'escape'`). Backspace with no search open only closes the menu when the
  opener passed `backspaceCloses: true` (reason `'backspace'`); otherwise it
  does nothing. An outside `mousedown` closes with reason `'outside'`, a
  selection closes with reason `'select'`.
- Closing a menu returns focus exactly where it was: the caller can pass
  `restoreFocus?: () => void` (e.g. an editor host passes `() => view.focus()`
  so a CodeMirror selection comes back); without it, whatever had
  `document.activeElement` before the menu opened is refocused.
  **Order on select is restoreFocus → onSelect → unmount/close** — so an
  action that operates on e.g. an editor sees it focused again before it
  runs. This holds for both `<ContextMenu>` and `showContextMenu`.
- `anchor?: CaretAnchor` (`{ lineRect, prefer }`) positions the root panel
  next to a text caret's line instead of a fixed x/y point, via
  `computeCaretPlacement` in `caret-position.ts`. Placement is computed
  **once, when the menu opens** (measured while hidden, like a submenu is),
  so the chosen side never flips as the panel's height changes while
  searching — it just grows/scrolls within the `maxHeight` picked at open.
- `isContextMenuOpen(doc?)` (its own file, `context-menu-presence.ts`) reports
  whether any `.context-menu` panel is currently in the document — used by
  hosts (e.g. the timeline's keyboard shortcuts, via `isBlocked` in
  `timeline-view.tsx`) that must suspend their own key handling while a menu
  is open. It's presence-based, not focus-based: while searching, focus sits
  in the search `<input>`, and exiting search briefly unmounts it, so a
  focus-only check could see focus fall to `<body>` for a tick and let a
  window-capture listener registered before the menu's own (e.g. the
  timeline's) act on the next keystroke. The menu also moves focus back to
  its panel itself when search exits, so focus never actually falls to body
  while it's open — `isContextMenuOpen` is the belt-and-suspenders check.

## Files

- `types.ts` — the `ContextMenuItem` union (`action` / `submenu` / `separator`
  / `header`), `ContextMenuVariant`, `ContextMenuCloseReason` and
  `CaretAnchor`. Recursive, no hardcoded depth limit.
- `menu-navigation.ts` — pure highlight movement: next/prev enabled index at
  a level (skipping separators/headers/disabled, with wraparound), plus path
  helpers (`itemAtPath`, `itemsAtPath`, `isPathPrefix`) for walking into and
  out of nested submenus by index path.
- `menu-search.ts` — pure `filterMenu(items, query)` (visible tree + ordered
  targets) and `pickAutoTarget(targets)` (best non-danger match). Uses
  `rankMatch` from `shared/search/rank.ts`; no fuzzy matching.
- `menu-keyboard.ts` — pure keyboard/search state machine (`MenuKeyState`,
  `menuKeyDown`, `menuQueryChange`, `menuHover`, `menuSearchHover`,
  `isPrintableKey`): every highlight move, submenu enter/leave, search
  start/exit/retarget and target activation, plus the two side effects a
  keystroke can request (`MenuEffect`: run an action, or close on
  Backspace). `context-menu.tsx` holds this as one `useState<MenuKeyState>`
  and only carries out the requested effect — it doesn't contain the logic.
- `use-context-menu-behavior.ts` — the single outside-click / keyboard
  listener for the root panel: viewport-clamp positioning (or, with
  `anchor`, caret placement), closing on outside `mousedown` or Escape, and
  focus capture/restore. All other keys (arrows, Enter, printable
  characters, Backspace) are decided by the caller via `options.onKeyDown`
  — this hook only owns the listener and the prevent/stop contract, not the
  decision logic (kept in `menu-navigation.ts`/`menu-search.ts`).
- `submenu-position.ts` — pure helper: parent row rect + panel size + viewport
  size → `{x, y}`. No DOM access; unit-testable in isolation.
- `caret-position.ts` — pure helper: line rect + popup size + viewport +
  preferred side → `{left, top|bottom, maxHeight}`.
- `context-menu.tsx` — `<ContextMenu items x y onClose restoreFocus
  backspaceCloses anchor>`, the declarative component. Renders rows
  recursively; a `submenu` row opens a child panel on hover, positioned via
  `submenu-position.ts`. Wires the pure search/navigation helpers to React
  state — it doesn't reimplement their logic.
- `show.ts` — imperative `showContextMenu(items, x, y, options?)` for callers
  outside a React tree (e.g. a CodeMirror span's native `contextmenu`
  handler). `options` (`anchor`, `onClose`, `restoreFocus`, `backspaceCloses`)
  is optional — existing 3-arg calls are unchanged.
- `context-menu.css` — panel, item, separator, header, disabled, submenu and
  search-row/highlight styles.

## When to use which entry point

- Inside a React tree (a component that already renders JSX): render
  `<ContextMenu items={...} x={...} y={...} onClose={...} />` directly.
- Outside a React tree: call `showContextMenu(items, x, y)`, which mounts its
  own `document.body` host and returns `{ close() }`. Mirrors
  `peek/show.ts`.

## Building an item list

Items are plain data (see `types.ts`), not JSX:

```ts
const items: ContextMenuItem[] = [
  { kind: 'action', label: 'Edit', onSelect: () => edit(id) },
  { kind: 'action', label: 'Delete', onSelect: () => remove(id), variant: 'danger' },
  { kind: 'separator' },
  { kind: 'header', label: 'Export' },
  { kind: 'submenu', label: 'Copy as…', items: [
    { kind: 'action', label: 'Markdown link', onSelect: () => copyMd(id) },
    { kind: 'action', label: 'Plain path', onSelect: () => copyPath(id) },
  ] },
];
```

Selecting any `action` (at any nesting depth) closes the whole menu tree, not
just the submenu it lives in.

## Conventions

- **Colours only via theme variants.** Every colour in `context-menu.css`
  resolves through a `var(--theme-*)` variable. `ContextMenuItem` does not
  accept raw colour strings — if a new visual treatment is needed, add a
  `ContextMenuVariant` and a matching CSS rule, don't thread a hex value
  through props.
- Submenu flip/shift math lives in `submenu-position.ts`, not inside the
  component — keep DOM measurement in `context-menu.tsx` and the arithmetic
  pure and testable.
- Nesting depth is unbounded by design; don't add a max-depth guard.

## Don't

- Don't put business logic (side effects beyond `onSelect`/`onClose`) inside
  `context-menu.tsx` — item construction and side effects belong to the
  caller.
- Don't reintroduce a bespoke outside-click/Escape listener per menu; use
  `useContextMenuBehavior` (root panel only — nested submenu panels are DOM
  descendants of the root panel, so the root's listener already covers them).
