# Shared Markdown Editor

A CodeMirror 6 wrapper for editing and previewing markdown. Used by notes and the timeline card expansion; intended for any surface that needs to display or edit markdown.

## Boundary rules

- **No imports from `../notes/` or any other host module.** This directory must be reusable from any surface. If you find yourself wanting to import notes-specific code, add a callback prop instead.
- **All file names are kebab-case.**
- **Host-specific behavior is injected, not detected.** No `if (isNotes)` branches. Add an optional config prop and have the host supply it.

## Module shape

- `markdown-editor.tsx` — `<MarkdownEditor>` React wrapper around CodeMirror 6.
- `markdown-preview.tsx` — `<MarkdownPreview>` thin read-only wrapper around `<MarkdownEditor>`. Use for non-editing surfaces (timeline card expansion, future peek windows). No `onChange` required.
- `format-toolbar.tsx` — `<FormatToolbar>` markdown-formatting buttons. Renders a host-supplied `footerSlot` in the right side of the toolbar.
- `commands.ts` — pure CodeMirror commands (bold/italic/heading/list/etc). Safe to import standalone for custom toolbars.
- `theme.ts` — `lastGaspThemeExtensions` styling + syntax highlighting.
- `extensions/wiki-links.ts` — `[[name|id]]` parsing, completion, click handler. Activated via `props.wikiLinks`.
- `extensions/relationship-directives.ts` — renders `{{trackId.action ...}}` directives (parsed by `src/shared/relationships/`) as atomic, form-like blocks. Activated via `props.relationshipDirectives`; live mode only. See `extensions/AGENTS.md` for why it uses `Decoration.replace`, unlike wiki links.
- `extensions/wiki-link-query.ts` — pure `WIKI_LINK_QUERY_RE` / `isInWikiLinkQuery(textBeforeCaret)`: detects an open `[[...` or `@...` link query. Shared by `wiki-links.ts` (completion source) and `slash-trigger.ts` (to suppress the `/` menu mid-query) so the two definitions can't drift.
- `extensions/editor-context-menu.ts` — the editor's own menu (Copy / Paste / Delete / Formatting, plus any host `contextMenu.extraItems`) on plain editor text. Opens on right-click, on typing `/` at the caret (see `extensions/slash-trigger.ts`), and on Shift+F10 / the ContextMenu key. Registered unconditionally, after the mode compartment so the wiki-link contextmenu handler (live mode only) gets first refusal on `.cm-note-link` clicks.
- `extensions/slash-trigger.ts` — pure `shouldOpenSlashMenu(state, pos)`: decides whether a typed `/` should open the menu instead of inserting a character.
- `extensions/decorations.ts` — markdown visual decorations (headings, bold, etc).
- `extensions/image-decorations.ts` — renders `![alt](url)` as an inline image widget. Accepts `resolveSrc` to transform raw image paths (e.g. relative paths → `notes-asset://`).
- `extensions/image-paste.ts` — clipboard paste. Calls `props.imagePaste.onImagePaste(blob, mime)` and inserts the returned URL.
- `extensions/drop-link.ts` — drag-and-drop. Calls `props.dropLink.decodeDrop(event)` and inserts the returned markdown.
- `domain/markdown/` — pure markdown manipulation functions (toggle inline/block, insert templates). No IO.

## Props contract

- `content` / `onChange` — controlled document. `onChange` is optional when `readOnly` is true.
- `readOnly` — when true, sets `EditorState.readOnly` and `EditorView.editable.of(false)`. Suppresses `highlightActiveLine`. `onChange` becomes optional.
- `isSourceMode` — toggles between live-decoration mode and plain source. Reconfigures a `Compartment`; never remounts.
- `images` — optional `{ resolveSrc?: (rawSrc: string) => string | null }`. Passed to `imageDecorations()`. Supply `resolveSrc` to render images with relative or non-`notes-asset://` URLs (e.g. timeline event bodies). Return `null` to skip rendering a given image.
- `savedInstance` / `onSaveInstance` — preserve doc + selection + undo history across host-level remounts (e.g., tab switching). The compartment is part of the saved instance and must round-trip.
- `viewRef` — imperative access for toolbars and focus management.
- `wikiLinks`, `imagePaste`, `dropLink` — optional host-supplied behaviors. Each is its own config object; omit to disable that feature entirely.
- `relationshipDirectives` — `{ library, defaultReason, onOpenNote?, onEditField? }`. Omit to still render directive blocks (built-in tracks only, `defaultReason: 'Unspecified'`) with no field-editing/note-opening callbacks. `onEditField` is a hook point only — the floating fill-in bubble UI is a later task.
- `contextMenu.extraItems` — optional `EditorMenuExtraItems` (`(ctx: EditorMenuContext) => ContextMenuItem[]`) appended, after a separator, to the editor's own menu — both the right-click menu and the `/`-triggered one. `EditorMenuContext` gives the host the acted-on range (`from`/`to`), `selectedText`, and `replaceRange(text)` to replace it and refocus the editor. Read lazily each time a menu opens (via a ref), so changing the callback after mount takes effect on the next open without rebuilding the base extension layer.

## How to add a new read-only preview surface

Use `<MarkdownPreview>` — it accepts `content`, `images`, `wikiLinks`, and `className`. Do not reach for a separate markdown library.

## How to add a new host

1. Import `MarkdownEditor` and `FormatToolbar` from `shared/markdown-editor`.
2. If you need wiki links, image paste, or drag-drop, build the config objects in a host-local `editor-bindings.ts`.
3. Mount `<FormatToolbar viewRef={viewRef} isEditable footerSlot={...} />` somewhere visible — usually a `<FooterPortal>` — and put host-specific controls (mode toggle, metadata panel, etc.) inside `footerSlot`.

## Tests

- `__tests__/markdown-editor.test.tsx` — wrapper behavior (mount, onChange, mode toggle, instance restore, viewRef lifecycle, footerSlot).
- `extensions/__tests__/*.test.ts` — per-extension unit tests.
- `domain/markdown/__tests__/*.test.ts` — pure function unit tests.

When you add a new extension, write its tests in `extensions/__tests__/`. When you change the wrapper's prop contract, update `markdown-editor.test.tsx` and the props table above.

## Editor architecture

### Extension stack

`<MarkdownEditor>` builds its extension list at mount time and never remounts for prop changes. The stack has two layers:

**Base extensions (always active, built once):**
CodeMirror standard extensions (history, keymaps, bracket matching, closeBrackets, etc.), the markdown language grammar with code language auto-detection, `lastGaspThemeExtensions`, `EditorView.lineWrapping`, the `updateListener` that fires `onChange`, and `editorContextMenu({ readOnly, getExtraItems })` (the editor's own menu — see below). `imagePaste` and `dropLink` are pushed into this layer when their config objects are supplied — they must be fixed at mount and cannot be toggled.

#### The editor's own context menu

`editorContextMenu` shows no menu at all in a read-only editor (right-click just suppresses the native OS menu and lets the event bubble to the host; the `/` trigger and Shift+F10/ContextMenu keymap are no-ops). In an editable editor the menu opens three ways, always in the same order: any `contextMenu.extraItems` first (e.g. "New note…"), then a separator (only when there were host items), then a Formatting submenu, then a separator, then Copy, Paste, Delete.

- **Right-click** — at the pointer, acting on the selection if the click landed inside it, otherwise a caret at the click point.
- **Typing `/`** — held back (not inserted) and the menu opens anchored at the caret's line, when `shouldOpenSlashMenu` (`extensions/slash-trigger.ts`) says the caret is at a word boundary — the start of its line (any line, including an empty one, or right after a list/blockquote marker's space) or after whitespace — and not inside code, a wiki-link `[[...` or `@...` query (`extensions/wiki-link-query.ts`), or a URL/Link — this is what keeps `and/or`, `1/2`, and `http://` from ever triggering it. Escape (or clicking outside) re-inserts a literal `/`; Backspace drops it entirely; choosing an action runs it in place of the `/`. Typing `/` while there's a selection just types `/` normally (replacing the selection), it never opens the menu.
- **Shift+F10 / the ContextMenu key** — opens the same menu anchored at the caret, acting on the current selection, without the `/` bookkeeping (no re-insertion on Escape, Backspace doesn't close it).

**Mode compartment (hot-swappable via `Compartment`):**
`markdownDecorations()`, `imageDecorations(imagesConfig)`, `wikiLinks(...)`, `markdownLinkClick(...)`, and `relationshipDirectives(...)` are all bundled inside a single `Compartment`. In source mode the compartment holds an empty array; in live mode it holds these five. Switching mode calls `compartment.reconfigure(...)` — no editor recreation. The compartment instance is part of the `SavedEditorInstance` and must always round-trip with the state it belongs to.

### Read vs write mode

`readOnly` is applied once at mount by pushing `EditorState.readOnly.of(true)` and `EditorView.editable.of(false)` into the base extensions. `highlightActiveLine` is omitted in this case. Both read and write modes use the same CodeMirror instance with the same mode-compartment extensions — decorations, image widgets, and wiki-link widgets all work in read-only mode. `<MarkdownPreview>` is simply `<MarkdownEditor readOnly ... />` wrapped in a `<div>` for layout; it accepts `content`, `images`, `wikiLinks`, and `baseDir` (used by the peek stack for plain `<a>` link resolution).

### Host-local wiring: the `editor-bindings.ts` pattern

A host is responsible for constructing the config objects that activate optional editor behaviors. Notes does this in `src/renderer/notes/editor-bindings.ts`, which exports three factory functions:

- `makeImagePasteConfig(folder, campaignPath)` — returns an `ImagePasteConfig` with `onImagePaste` that saves the blob to `notes/{folder}/assets/pasted-*.ext` and returns a `notes-asset://` URL.
- `makeDropLinkConfig()` — returns a `DropLinkConfig` that decodes the `application/x-last-gasp-note` MIME type from sidebar drags and produces either a `![…](notes-asset://…)` or `[[label|id]]` insert.
- `makePeekWikiLinksConfig()` — returns the hover callbacks (`onHover`, `onHoverEnd`) that open/close the peek stack.

The host passes these config objects as `imagePaste`, `dropLink`, and a spread into `wikiLinks` props. The shared editor never knows about campaign paths, sidebar MIME types, or the peek system.

The event editor (`EventEditorModal.tsx`) follows the same approach with a simpler setup: no image paste, no drop-link, wiki-links wired inline with `suggestLinksForIndex`, `onOpenById`, peek hover callbacks, `knownIds`, and `entityLabelMap`. No `editor-bindings.ts` is needed when the config is short enough to build inline.

### How state flows into the editor

`knownIds` and `entityLabels` are React props on `WikiLinksHostConfig`, but they do **not** flow through React's prop update path in the usual way. After mount, the editor holds a stable CodeMirror view. When these props change (because the entity index updated), dedicated `useEffect` hooks dispatch `StateEffect`s directly onto the view:

```ts
view.dispatch({ effects: setKnownIds.of(wikiLinksConfig.knownIds) });
view.dispatch({ effects: setEntityLabels.of(wikiLinksConfig.entityLabels) });
```

Inside the wiki-links extension, `knownIdsField` and `entityLabelMapField` are `StateField`s that update in response to those effects. The decoration `StateField` rebuilds whenever either effect arrives (`e.is(setKnownIds) || e.is(setEntityLabels)`). This means decoration rebuilds are O(doc) but happen only when the index actually changes — not on every keystroke.

The same dispatch-based pattern applies to external content updates (file reloaded from disk) and mode toggles: all use `view.dispatch(...)` rather than remounting.

### Key distinction

The editor is a shared rendering primitive. Hosts are responsible for wiring behavior via config objects; they must not modify the editor. If you find yourself wanting to add host-specific logic inside `markdown-editor.tsx`, add a callback prop instead and implement the behavior in the host's `editor-bindings.ts` (or inline).

## Common pitfalls

- **Don't put the campaign path or folder into the editor's props.** That's a notes-ism. Build the IO callback in the host and pass it as `imagePaste.onImagePaste`.
- **Don't add a sidebar drag MIME type here.** Add a `dropMimeType` + `decodeDrop` config instead.
- **The compartment and its state are paired.** Never share a compartment instance across editor mounts unless you also share the saved state it belongs to.
- **`wikiLinks.knownIds` drives broken-link highlighting.** An empty set means "don't highlight any links as broken yet" — pass `undefined` if the index hasn't loaded yet.
