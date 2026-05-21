# `src/renderer/notes/` — Notes View (React)

The folder/file browser, tabbed editor, and live markdown editor for
notes (NPCs, locations, factions, plots, etc.). React, not vanilla DOM.

## Layout

```
notes/
  notes.tsx                   # view-level component
  data.ts                     # thin wrapper over window.fsApi (IO boundary)
  scan-folder.ts              # scanFolderContents — IO-only, no React
  editor-bindings.ts          # pure config-builder functions
  types.ts
  domain/                     # pure functions, no React, no IO
    slugify.ts
    open-note-by-path.ts      # parseNotePath
    link-resolution.ts        # suggestLinks, resolveLinkById, resolveMarkdownHref
    __tests__/
  hooks/
    useNotesController.ts     # orchestrator (see ceiling note)
    useSaveSync.ts
    useFolderTree.ts
  components/
    FolderSidebar.tsx
    EditorTabs.tsx
    BreadcrumbNav.tsx
    MetaPanel.tsx
    QuickAdd.tsx
    NoteContextMenu.tsx
  __tests__/                  # cross-cutting tests
  styles/
```

## Layer rules

- **`domain/`** — pure functions, no React, no `window.fsApi`, no `notesData`.
  Tested directly in `domain/__tests__/`.
- **Top-level `.ts` files** (`scan-folder.ts`, `editor-bindings.ts`, `data.ts`) — non-React IO or
  config logic. May import `data.ts` / `notesData`. No React. Tested in `__tests__/` with `vi.mock`.
- **`hooks/`** — React state and effects. May import `domain/` and the top-level helpers.
- **`components/`** — JSX only. Receive props; do not import `notesData` directly.

## useNotesController ceiling

The orchestrator is ~750 lines. The remaining length is file-ops handlers (`handleRename*`,
`handleDelete*`, `handleMove`, `commitNew*`, `handleQuickAddCreate`) that each thread 5–10
setState calls. Pulling these into a hook would mean passing every setter through a deps object —
the abstraction would be larger than the code it hides.

**New pure logic goes in `domain/`. New IO-only logic goes as a named file alongside
`scan-folder.ts`. Do not add logic to the orchestrator.** If a handler grows non-trivial
computation, extract the computation to `domain/` and call it from the handler.

## React conventions

- One component per file. Filename matches the export.
- Hooks for state and effects.
- Components for JSX only.
- `domain/` for pure logic.
- Top-level `.ts` files for non-React IO or config.

## Don't

- Don't call `window.fsApi` directly from React. Go through `data.ts` or a top-level helper.
- Don't reimplement folder tree state — `useFolderTree` is the source of truth.
- Don't put logic in the orchestrator that would be equally at home in `domain/` or a
  standalone `.ts` file.
