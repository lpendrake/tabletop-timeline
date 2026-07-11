# `src/renderer/shared/context-menu/` — Data-Driven Context Menus (React)

A single reusable context-menu system. Callers configure a menu by passing an
item list (data), not markup. Replaces hand-rolled menus one at a time; the
existing `event-context-menu.tsx` / `note-context-menu.tsx` still render their
own markup and are migrated in a later ticket.

## Files

- `types.ts` — the `ContextMenuItem` union (`action` / `submenu` / `separator`
  / `header`) and `ContextMenuVariant`. Recursive, no hardcoded depth limit.
- `use-context-menu-behavior.ts` — viewport-clamp positioning + outside-click
  / Escape close, for the root panel.
- `submenu-position.ts` — pure helper: parent row rect + panel size + viewport
  size → `{x, y}`. No DOM access; unit-testable in isolation.
- `context-menu.tsx` — `<ContextMenu items x y onClose>`, the declarative
  component. Renders rows recursively; a `submenu` row opens a child panel on
  hover, positioned via `submenu-position.ts`.
- `show.ts` — imperative `showContextMenu(items, x, y)` for callers outside a
  React tree (e.g. a CodeMirror span's native `contextmenu` handler).
- `context-menu.css` — panel, item, separator, header, disabled, and submenu
  styles.

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
