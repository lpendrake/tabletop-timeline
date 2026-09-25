# Extensions — Wiki Links

This directory contains CodeMirror 6 extensions for the shared markdown editor. This file documents the wiki-link subsystem specifically. See the parent `AGENTS.md` for the broader editor contract.

## Wiki link syntax

Two formats are supported:

| Format | When to use |
| --- | --- |
| `[[id]]` | Let the display label be resolved from the entity index. |
| `[[label\|id]]` | Override the display label locally. The local label always wins. |

The `id` is a short alphanumeric entity key (e.g. `abc1`). IDs are trimmed of surrounding whitespace; an empty `id` after trimming causes the token to be silently skipped.

## Parsing — `findWikiLinksInLine`

`findWikiLinksInLine(text, lineStart)` scans a single line of text and returns every `ParsedWikiLink` found:

```ts
interface ParsedWikiLink {
  from: number;      // absolute doc position of the opening [[
  to: number;        // absolute doc position just after the closing ]]
  id: string;        // trimmed entity id
  label: string | null;  // trimmed local label, or null when format is [[id]]
  labelFrom: number | null;
  labelTo: number | null;
}
```

The scanner is a simple index-based loop — no regex — finding `[[` then the nearest `]]`, splitting on the first `|` inside the body. All positions are offset by `lineStart` so callers can work in doc coordinates directly.

## Decoration lifecycle — split rendering

Every wiki link is rendered as **two pieces shown side by side, always**, regardless of cursor position or selection:

- The **raw source** (`[[id]]` or `[[label|id]]`) stays real, editable, cursor-navigable document text. It is never swapped out — `buildDecorations` only wraps it in a `Decoration.mark({ class: 'cm-wiki-link-raw' })` (muted styling), which does not remove or replace any text.
- The **rendered display name** is shown immediately after it as a `Decoration.widget` (`WikiLinkWidget`), added as a **zero-length inserted** decoration at `link.to` (`builder.add(link.to, link.to, Decoration.widget({ widget, side: 1 }))`). Because an inserted widget occupies no document position, the cursor can never land inside it and it is inherently atomic — selection/arrow-key navigation treats it as a single unit without any special-casing. **`Decoration.replace` is not used for wiki links.**

`wikiLinks(config)` returns an `Extension` bundle. The core is a `StateField<DecorationSet>` that calls `buildDecorations(state, config)` whenever:

- the document changes (`transaction.docChanged`)
- a `setKnownIds` or `setEntityLabels` effect arrives

Selection changes do **not** trigger a rebuild — rendering no longer depends on cursor position, which is what eliminates the reflow/"jump" that used to happen when the raw source and rendered name (different widths) swapped in and out on every click.

### Widget rendering — `WikiLinkWidget`

For every link, `buildDecorations` adds a `WikiLinkWidget` immediately after the raw mark. The widget renders a `<span>` with:

- `class="cm-note-link"` (or `cm-note-link cm-note-link-broken` for a missing entity)
- `data-note-id="{id}"` — used by peek and click handlers
- `textContent` set via the **label resolution chain**:
  1. Local label from `[[label|id]]` if present
  2. Lookup in `entityLabelMapField` by id
  3. Raw id as fallback

A **plain left-click** (no modifier required) on the `.cm-note-link` span navigates to the entity via `config.onOpen(id)` — see "Keyboard bindings" below. A click on the raw text (not `.cm-note-link`) is not intercepted and places the cursor normally, since the raw text is ordinary document content.

## StateFields

### `knownIdsField` — broken-link detection

Holds a `Set<string>` of all entity ids that currently exist. A link is marked broken when `knownIds.has(link.id)` is false **and** the set is non-empty. An empty set means "index not loaded yet — don't highlight anything as broken."

Dispatch a `setKnownIds` effect to update it without rebuilding the editor:

```ts
view.dispatch({ effects: setKnownIds.of(new Set(['abc1', 'def2'])) });
```

### `entityLabelMapField` — label resolution

Holds a `Map<string, string>` mapping entity id → display label. Used by `WikiLinkWidget` when no local label override is present.

Dispatch a `setEntityLabels` effect to push a new map:

```ts
view.dispatch({ effects: setEntityLabels.of(new Map([['abc1', 'Alice the Wizard']])) });
```

Both StateFields replace their entire value on each matching effect — they do not merge.

## Completions — `wikiLinkCompletions`

Activated when `config.suggest` is provided. Matches the regex `/(?:\[\[|@)[^\]\n|@]*$/` at the cursor — so both `[[query` and `@query` trigger the completion menu (`@` is a shorthand alias).

Flow:
1. `parseTrigger` extracts the trigger prefix length (2 for `[[`, 1 for `@`) and the raw query string.
2. `config.suggest(query)` is called (async); returns `WikiLinkSuggestion[]`.
3. Each suggestion's `apply` callback calls `buildWikiLinkInsert`, which:
   - For normal entities: inserts `[[id]]` (label-free format), absorbing a trailing `]]` if already present.
   - For image assets (`suggestion.assetPath` set): inserts `![label](notes-asset://current/{assetPath})` instead.

`config.suggest` is implemented in `src/renderer/shared/suggest-links.ts` (`suggestLinks`) which filters `EntityIndexEntry[]` by title or id substring match.

## Keyboard bindings

`wikiLinkEditKeymap` (highest precedence):

- **Backspace** at the closing `]]` of a label-free `[[id]]` link: moves cursor to just after `[[` instead of deleting, preventing accidental destruction of the whole token.
- **Ctrl-Enter** (or Cmd-Enter): opens the link under the cursor via `config.onOpen(id)`.

**A plain left-click** on a rendered `.cm-note-link` span calls `config.onOpen(id)` (no Cmd/Ctrl modifier needed — see "Decoration lifecycle" above). `makeWikiLinkPointerGuard` passes `{ anyLeftClick: true }` to `makePointerGuard('.cm-note-link', …)` so the pointerdown on the widget is swallowed in the capture phase (preventing CM6 from attempting to place a cursor there) before the click handler runs. This is a wiki-link-specific option on the shared `makePointerGuard` helper — other call sites (e.g. `markdown-link-click.ts`'s `.cm-md-link` guard) keep the default Cmd/Ctrl-only gating.

## Peek integration

Peek integrates at the DOM level — it does not depend on CodeMirror APIs.

`src/renderer/peek/stack.ts` listens to `document` `mouseover`/`mouseout` events. When the hovered element is a `.cm-note-link` span, it reads `dataset.noteId` and calls `resolvePeekTarget(noteId, '', entityIndex)` from `src/renderer/peek/resolve.ts`. If a target is found, a peek window is scheduled to open after 150 ms (cancelled on mouse-out after 250 ms).

The notes editor wires this up via `makePeekWikiLinksConfig()` in `editor-bindings.ts`, which supplies `onHover` → `openFromWikiLink` and `onHoverEnd` → `closeFromWikiLink` as `WikiLinksConfig` callbacks. These callbacks are the bridge between CodeMirror's `mouseover`/`mouseout` handlers (inside `makeWikiLinkPointerGuard`) and the peek stack.

`resolvePeekTarget` accepts a bare id (no slashes, no protocol, no `.md` extension) and looks it up in the entity index, returning `{ path }` or `null` for unresolvable or asset entries.

## Key files

| File | Role |
| --- | --- |
| `extensions/wiki-links.ts` | Parser, `WikiLinkWidget`, StateFields (`knownIdsField`, `entityLabelMapField`), StateEffects (`setKnownIds`, `setEntityLabels`), completions, click/hover handlers |
| `extensions/__tests__/wiki-links.test.ts` | Unit tests for parsing, decoration modes, label resolution, completion insertion, hover callbacks |
| `src/renderer/shared/suggest-links.ts` | `suggestLinks(entityIndex, query)` — pure filter used as `config.suggest` |
| `src/renderer/notes/editor-bindings.ts` | `makePeekWikiLinksConfig()` — wires `onHover`/`onHoverEnd` to peek stack; `makeDropLinkConfig()` — generates `[[label|id]]` inserts on sidebar drag-drop |
| `src/renderer/peek/resolve.ts` | `resolvePeekTarget(href, baseDir, entityIndex)` — resolves a wiki-link id or plain href to a peekable file path |
| `src/renderer/peek/stack.ts` | Peek open/close scheduling; `openFromWikiLink` / `closeFromWikiLink` consumed by `WikiLinksConfig` |

## Common pitfalls

- **`knownIds` empty ≠ all links valid.** Pass `undefined` (causes `wikiLinks.knownIds` to not dispatch `setKnownIds`) while the index is loading, not an empty `Set`. An empty `Set` suppresses broken-link highlighting entirely.
- **Do not read entity labels from within the extension itself.** Labels flow in via `setEntityLabels` — the extension never imports from notes or the entity index directly.
- **The completion always inserts `[[id]]`, not `[[label|id]]`.** Label resolution happens at render time via the StateField, so storing the label in the doc is unnecessary.
- **Decorations do not rebuild on selection change.** Rendering is split (raw text + widget always both shown), so there is nothing selection-dependent left to toggle. Don't reintroduce a `transaction.selection` check into the StateField update guard — it would just cause unnecessary rebuilds.
- **Never use `Decoration.replace` for a wiki link's `[[…]]` range.** That was the old atomic-swap approach and is what caused the reflow "jump" this design replaced. The raw range only ever gets a `Decoration.mark`; the rendered name is a separate zero-length `Decoration.widget` inserted at `link.to`.

## Relationship directives — `extensions/relationship-directives.ts`

Renders relationship directives (`{{trackId.action ...}}`, parsed and interpreted by `src/shared/relationships/`) as atomic, form-like blocks in live mode — see that module's `AGENTS.md` first.

**Why this extension uses `Decoration.replace`, unlike wiki links above:** a directive is a form, not text with an inline link. Its raw envelope (`{{rp01.change …}}`) must never be visible in live mode — not at the caret, not under a selection, not on click — because it's an implementation detail of the ledger, not content a GM writes or reads. Wiki links keep their raw source visible (muted) specifically so click-to-place-cursor, find/replace and copy all still work on real text; directives forbid exactly that. `Decoration.replace({ widget })` over the full directive range, plus `EditorView.atomicRanges` on the same decoration field, is what makes this possible: the caret skips the block as one unit and there is no raw text left in the DOM to reveal. Decorations rebuild only on `docChanged` and the `setDirectiveContext`/`setEntityLabels` effects — never on selection, exactly like wiki links' own decoration field.

Other notes:
- **Malformed `{{rp01.…` blocks** (a `DirectiveParseError` from `parseDirectives`) are left as plain, undecorated text — this extension only renders directives that parsed cleanly. A directive with an *unknown* track or action still parses fine; it renders as a red-bordered block showing its raw content with the problem in its `title`, which is different from a parse error.
- **No directive data is read from the DOM.** Every click/contextmenu listener is attached inside the widget's own `toDOM(view)` (per block, per value span) as a closure over the widget's own data (directive, parts, role, noteId). To act on a block, a handler resolves its directive's CURRENT position via `currentDirectiveAt(view, root)`, which uses `view.posAtDOM(root)` — CodeMirror's own DOM→position mapping — never a `data-from`/`data-to`/`data-ordinal`/`data-role`/`data-note-id` attribute and never a number captured at render time. This is what makes clicks route correctly even after CodeMirror reuses a widget's DOM node for a content-equal rebuild (see `DirectiveWidget.eq`) — object-identity lookups into the decoration field do NOT survive that reuse, since `buildDecorations` always constructs fresh widget objects even when `eq()` says the old DOM can stay; `posAtDOM` sidesteps that by asking the live view directly. A stale/detached root resolves to `null` and the handler does nothing. `cm-directive-value-role-{role}` is a class, not a `data-*` attribute — present for styling/testing, never read back as data.
- Clicking a blank (or Enter on a selected block) opens the built-in fill-in bubble via `openDirectiveBubble(view, directive.from, role)` (from `relationship-bubble-state.ts`) directly — no host callback needed; there is no escape hatch to handle field-editing another way.
- Pure, unit-tested helpers: `firstEditRole(parts)` (which blank a click on the wording targets) and `crossEnd(fraction, previous)` (the delete-cross hysteresis, switching only past 60%/40% so it doesn't flicker near the middle).
- `config.place` (`'note' | 'event'`, default `'event'`) is passed to `interpretDirective` as `undated: place === 'note'` — see `src/shared/relationships/AGENTS.md`'s notes-vs-events invariant.
- Every directive lookup (`buildDecorations`, `makeBoundaryCommand`, the Enter keymap, `currentDirectiveAt`) reads `directivesIn(state)` from `parsed-directives.ts`'s `parsedDirectivesField` rather than calling `parseDirectives` on the whole buffer itself — that field reparses only on `docChanged`, so a selection-only transaction (moving the caret, opening the bubble) costs nothing.
- `wiki-links.ts` imports `directiveRanges(state)` from `parsed-directives.ts` (not from this file) so its own `buildDecorations` can skip `[[id]]` occurrences that live inside a directive's role tokens — importing this extension's own code back into `wiki-links.ts` would be circular, since this file already imports `entityLabelMapField` from there.

## Fill-in bubble — `relationship-bubble-*`

A floating box that edits one blank of a directive at a time, following it as the document changes. Split, per the root `CLAUDE.md`'s "no business logic in hooks/components" rule:

| File | Role |
| --- | --- |
| `relationship-bubble-logic.ts` | PURE. Blank ordering (`blankRoles`/`firstBlankRole`/`nextBlankRole`/`previousBlankRole`), per-role validation (`validateAmount`, `validateNumericValue`), stepping (`stepAmount`, `stepNumericValue`, `stepRung`), the Enter/Tab/Shift-Tab/arrow key→action decision (`decideBubbleKey`), the option Create-row decision (`shouldOfferCreateOption`), `filterHeldOptions`, `sanitiseFreeText`, the holder-without-default notify check (`shouldNotifyHolderChosen`), the note picker's recents assembly (`buildNotePickerRecents`) and prefill (`prefillNoteValue`), and the Tab-to-pick ranking (`pickForTab`). Also the single definition of `BubbleCommitDirection`. Unit-tested directly, no CodeMirror or React. |
| `relationship-bubble-state.ts` | The bubble's home in editor state: `bubbleStateField` (`{ anchor, role } \| null`), `openBubbleEffect`/`closeBubbleEffect`, mapped through every change via `tr.changes.mapPos(anchor, -1, MapMode.TrackDel)` and re-validated against `parsed-directives.ts`'s `directivesIn(state)` — a directive that's gone (deleted, undone, replaced by a full-doc reload) closes the bubble with no error and no stray edit. `openDirectiveBubble`/`closeDirectiveBubble`, `insertDirective` (one transaction: the insert + opening the first blank), `commitBubbleField` (one transaction: `setRoleValueChange` + moving to the next/previous blank or closing — `isolateHistory.of('full')` keeps each field's write its own undo step). |
| `relationship-bubble.tsx` | Presentational only. Renders the box (tail, prompt, one field) and forwards input/keydown events; every decision (validate, step, advance/back/hop, the Create-row check, holder-without-default, recents, prefill, Tab-to-pick) calls into `relationship-bubble-logic.ts` rather than deciding anything itself. `amount`/numeric `value` are a text input; ordinal `value`/`holder`/`observer`/`option` are all `SearchablePicker`s — `option` supplies a `createRow` (see `searchable-picker/AGENTS.md`) so an unmatched query can offer "Create …" with a "Symmetrical" checkbox (stored as `mutual`), and shows a loading state while the host's async `heldOptions` is resolving (`props.heldOptionsLoading`); `reason` is a text input whose placeholder is the host's default (Enter on empty commits `''`, so the default is used at read time, never stored). |
| `relationship-bubble-view-plugin.ts` | The `ViewPlugin` that mounts `relationship-bubble.tsx` on `document.body` (outside `view.dom`, so the bubble's own native input undo is never seen by CodeMirror's keymap) via a `react-dom/client` root, syncing it to `bubbleStateField`. Renders once hidden to measure real dimensions, then positions via `computeCaretPlacement(lineRect, size, viewport, 'above')` (from `../../context-menu/caret-position`) using `getCaretRect(view, anchor)` (exported from `editor-context-menu.ts`) for the blank's rect, and re-renders visible — measuring must be deferred (`queueMicrotask`) because `EditorView.coordsAtPos` throws if called synchronously inside a CodeMirror update. `relationshipBubble(getContext)` is the extension; `getContext` supplies `library`, `defaultReason`, and the picker/create-option/held-options callbacks (`RelationshipBubbleHostContext`, which extends `RelationshipBubbleOptions` — the single definition also referenced by `markdown-editor.tsx`'s `RelationshipDirectivesHostConfig.bubbles`). The host's `heldOptions` is async and takes `{ trackId, holder, observer, anchor, doc }` (`HeldOptionsQuery`); the plugin caches the last resolved result per `(trackId, holder, observer, anchor)` key, shows the "remove" option bubble as loading while a fetch for a new key is in flight, and discards a response once `heldOptionsToken` has moved past it (a later blank/edit superseded it) rather than applying stale keys. |

Read-only editors never get an open bubble: `relationship-directives.ts` only ever dispatches `openBubbleEffect` from its own (non-read-only-gated) handlers, and those handlers already refuse to run when read-only.
