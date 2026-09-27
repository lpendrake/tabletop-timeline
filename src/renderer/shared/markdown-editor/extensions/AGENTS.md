# Extensions — Wiki Links

This directory contains CodeMirror 6 extensions for the shared markdown editor. This file documents the wiki-link subsystem specifically. See the parent `AGENTS.md` for the broader editor contract.

## Wiki link syntax

Two formats are supported:

| Format          | When to use                                                      |
| --------------- | ---------------------------------------------------------------- |
| `[[id]]`        | Let the display label be resolved from the entity index.         |
| `[[label\|id]]` | Override the display label locally. The local label always wins. |

The `id` is a short alphanumeric entity key (e.g. `abc1`). IDs are trimmed of surrounding whitespace; an empty `id` after trimming causes the token to be silently skipped.

## Parsing — `findWikiLinksInLine`

`findWikiLinksInLine(text, lineStart)` scans a single line of text and returns every `ParsedWikiLink` found:

```ts
interface ParsedWikiLink {
  from: number; // absolute doc position of the opening [[
  to: number; // absolute doc position just after the closing ]]
  id: string; // trimmed entity id
  label: string | null; // trimmed local label, or null when format is [[id]]
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

Activated when `config.suggest` is provided. Registered on the shared `completionSources` facet (see `editor-completions.ts`), not its own `autocompletion({ override })`, so it can coexist with relationship directive blanks. Matches the regex `/(?:\[\[|@)[^\]\n|@]*$/` at the cursor — so both `[[query` and `@query` trigger the completion menu (`@` is a shorthand alias).

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

| File                                      | Role                                                                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `extensions/wiki-links.ts`                | Parser, `WikiLinkWidget`, StateFields (`knownIdsField`, `entityLabelMapField`), StateEffects (`setKnownIds`, `setEntityLabels`), completions, click/hover handlers |
| `extensions/__tests__/wiki-links.test.ts` | Unit tests for parsing, decoration modes, label resolution, completion insertion, hover callbacks                                                                  |
| `src/renderer/shared/suggest-links.ts`    | `suggestLinks(entityIndex, query)` — pure filter used as `config.suggest`                                                                                          |
| `src/renderer/notes/editor-bindings.ts`   | `makePeekWikiLinksConfig()` — wires `onHover`/`onHoverEnd` to peek stack; `makeDropLinkConfig()` — generates `[[label                                              | id]]` inserts on sidebar drag-drop |
| `src/renderer/peek/resolve.ts`            | `resolvePeekTarget(href, baseDir, entityIndex)` — resolves a wiki-link id or plain href to a peekable file path                                                    |
| `src/renderer/peek/stack.ts`              | Peek open/close scheduling; `openFromWikiLink` / `closeFromWikiLink` consumed by `WikiLinksConfig`                                                                 |

## Common pitfalls

- **`knownIds` empty ≠ all links valid.** Pass `undefined` (causes `wikiLinks.knownIds` to not dispatch `setKnownIds`) while the index is loading, not an empty `Set`. An empty `Set` suppresses broken-link highlighting entirely.
- **Do not read entity labels from within the extension itself.** Labels flow in via `setEntityLabels` — the extension never imports from notes or the entity index directly.
- **The completion always inserts `[[id]]`, not `[[label|id]]`.** Label resolution happens at render time via the StateField, so storing the label in the doc is unnecessary.
- **Decorations do not rebuild on selection change.** Rendering is split (raw text + widget always both shown), so there is nothing selection-dependent left to toggle. Don't reintroduce a `transaction.selection` check into the StateField update guard — it would just cause unnecessary rebuilds.
- **Never use `Decoration.replace` for a wiki link's `[[…]]` range.** That was the old atomic-swap approach and is what caused the reflow "jump" this design replaced. The raw range only ever gets a `Decoration.mark`; the rendered name is a separate zero-length `Decoration.widget` inserted at `link.to`.

## Relationship directives — live blanks in the text

A directive (`{{trackId.action ...}}`, parsed and interpreted by `src/shared/relationships/` — read that module's `AGENTS.md` first) is edited **in the document itself**. There is no popover, form or draft: each blank is the real `{role:value}` text, and the caret goes into it like any other text. Keep it that way — don't add a separate editing surface or draft state that holds values outside the document.

**A typed query is real document text, on purpose.** While choosing a note, `{holder:spi}` is what's in the buffer, and autosave can write it to disk. It shows as a problem until a note is picked. Don't "fix" this with draft state — that's the design this replaced.

```
{{rp01.change Rep change: {amount:-2} {observer:[[a1b2]]} rep for {holder:} — {reason:}}}
└ envelope ──┘└ wording ─┘└ delim ┘│  │                        …      └ empty value (a point)
                                   value
```

| Range                                | Shown as                                 | Primitive                                                                   | Caret / typing                                                  |
| ------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Envelope `{{rp01.change `            | chip ("PF2E Reputation · Change")        | `Decoration.replace` + stateless `ChipWidget`                               | atomic                                                          |
| `{role:` / `}` delimiters            | nothing                                  | `Decoration.replace({})`                                                    | atomic, zero width                                              |
| Template wording                     | muted text                               | `Decoration.mark` (`cm-directive-wording`)                                  | atomic — arrows hop blank to blank                              |
| Value (typed text)                   | highlighted text                         | `Decoration.mark` (`cm-directive-value`, role class, error class + `title`) | real text: typing, selection, copy, find, undo are all native   |
| Value (note link, tag key, rung key) | the label                                | `Decoration.replace` + `TextWidget` (`cm-directive-value-label`)            | atomic; typing over it replaces the whole value (see the guard) |
| Empty value                          | prompt, or the default reason in italics | zero-width `Decoration.widget` (`cm-directive-placeholder`)                 | the caret sits on the point; typing fills it                    |
| Closing `}}`                         | hover ×                                  | `CrossWidget` (handles its own mousedown)                                   | atomic                                                          |

Everything that isn't a value is merged, per directive, into the stretches between values (`layout.structure`) and registered as `atomicRanges`, so → from the end of one blank lands on the start of the next.

### Files

| File                                    | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `relationship-directive-layout.ts`      | PURE. Where each directive's envelope, wording, delimiters, value slots and structure are (`directiveLayout`), slot lookup and navigation (`slotAt`, `adjacentSlot`, `firstEditSlot`, `nearestSlot`), the edit rules (`classifyChange`), how a value reads (`valueDisplay`, built on the shared `knownValueLabel` that `readableParts` also uses, so the editor and the Relationships view always agree) and whether a role has a list (`roleHasChoices`).                                                                                                                                                                                 |
| `relationship-value-logic.ts`           | PURE. Stepping (`stepAmount`/`stepNumericValue`/`stepRung`), note ranking (`rankNoteOptions`, `noteChoices` — recents, the open note, the default holder), label ranking (`rankLabelled`, on `shared/search/rank.ts` like menu search), held-tag filtering, and the create/notify rules (`allowsCreateOption`, `shouldOfferCreateOption`, `shouldNotifyHolderChosen`).                                                                                                                                                                                                                                                                     |
| `relationship-directives.ts`            | The extension. `modelStateField` holds every directive's interpretation, layout, decorations and atomic ranges, rebuilt on doc changes, `setDirectiveContext`, `setEntityLabels` and reveal changes — never on selection. Also the guard, keymap, pointer handling, `insertDirective`, and opening a blank's choices when the caret arrives by click or insert. Per-editor settings live only in the `directiveConfig` facet (no default — `relationshipDirectives()` always provides it) and every piece reads them from state, so a modal and a read-only preview of the same file can coexist.                                          |
| `relationship-directive-completions.ts` | Choices for a blank through the shared autocompletion (`editor-completions.ts`): notes, tags (only held ones on a Remove, via the host's async `heldOptions`), rungs, and "Create …" / "Create … (symmetrical)" on an Add. Picking writes the key/link and moves the caret to the next blank in one transaction; the next list opens by itself (`activateOnCompletion`). Async host lookups are cached per `Text` object, so any edit starts fresh and a rejection shows everything unfiltered. A "Create …" pick keeps its blank's position through edits made while the host works, and writes only if that blank still holds the query. |
| `editor-completions.ts`                 | The editor's one autocompletion host. CodeMirror allows a single `override` list, so sources register on the `completionSources` facet; both this and `wiki-links.ts` include the same `editorAutocompletion` instance. Also `isEditorPopupOpen(target)` for hosts with their own Escape handling.                                                                                                                                                                                                                                                                                                                                         |

### The guard

`guardDirectiveEdit` is an `EditorState.transactionFilter` over **every** document change — typed, pasted, dropped, or dispatched by any other extension (image paste, link completion, label edits) — except undo/redo and changes annotated with `directiveGuardBypass` (only the host's whole-file reload uses it). New code is protected by default; don't narrow it back to labelled user events. Each change must stay inside one value (ends inclusive, so an empty blank accepts input), or cover whole directives, or touch none; anything else is refused, and the directive it would have broken flashes its outline (`cm-directive-blocked`, ~450 ms) so a refused keystroke never feels like a frozen editor. Inside a value it strips braces and line breaks (`sanitiseValue`), refuses anything but number characters in an amount or numeric value (`isNumericInputText`), and typing over a label value (note, tag, rung) widens the change to replace the whole value — so typing "spi" over "The Vanguard" leaves `{holder:spi}` as the query rather than `[[a1b2]]spi`.

A directive with an unknown track or action isn't live: it shows its raw text with a danger outline and its problem as a `title`, unprotected, so it can be fixed by hand. `Mod-/` inside any directive shows its raw source the same way until the caret leaves it.

### Keyboard

| Key (caret in a blank)                                      | Does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab / Enter                                                 | With a typed query that matches something: pick the highlighted choice, or the top match straight from the source if the list isn't open yet (so a fast "type, Tab" never skips the pick). Never a "Create …" row unless the user moved the highlight onto it — a typo plus Tab must not create a permanent tag. With no match, or no typed query: to the next blank, selecting its whole value so typing replaces it, and opening its list (typed text stays and shows as a problem); after the last blank, to just past the directive. |
| Shift-Tab                                                   | Previous blank.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Alt-↑ / Alt-↓                                               | Step an amount or numeric value by the track step, or an ordinal value by one rung.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Backspace after / Delete before a picked note, tag or level | Clears the whole value (its hidden key is never edited a character at a time), then opens the list. `wiki-links.ts`'s own Backspace rule skips links inside directives for this reason.                                                                                                                                                                                                                                                                                                                                                  |
| Home / End                                                  | Start / end of the blank; again for the line.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Backspace after / Delete before a directive                 | Select it; again deletes it (one undo step).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Mod-/                                                       | Show / hide this directive's raw source.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Escape closes an open list (autocomplete's own binding). CodeMirror arms an Escape-then-Tab "leave the editor" hatch on every Escape; `keepTabInBlanks` turns it back off while the caret is in a blank, so Escape then Tab goes to the next blank — outside blanks the hatch works as normal. Also, `EventEditorModal` checks `isEditorPopupOpen` so that Escape doesn't also close the modal.

### Pointer

A click on typed value text places the caret there (CodeMirror's own handling). Clicks on a widget — an empty blank's placeholder or a picked name — are resolved through `view.posAtDOM(widget)`, not coordinates: a zero-width widget sits next to hidden delimiters, and CodeMirror's coordinate mapping plus the atomic skip would otherwise snap the caret into the _previous_ blank (this only shows in a real browser, not happy-dom). A click on wording or the chip lands in the nearest blank. Ctrl/Cmd+click on a note opens it (`onOpenNote`), in read-only editors too. No directive data is read from DOM attributes — every lookup goes from a DOM node to a document position to the model.

### Other rules

- Read-only editors get the rendering and Ctrl/Cmd+click only: no guard, keymap, cross or choices.
- `place` (`'note' | 'event'`) is passed to `interpretDirective` as `undated: place === 'note'` — see the notes-vs-events invariant.
- `wiki-links.ts` skips `[[id]]` inside directives via `directiveRanges(state)` from `parsed-directives.ts`; `slash-trigger.ts` uses the same to never open the `/` menu inside a directive, and `insertDirective` moves an insert that would land inside a directive to just after it — directives never nest.
- Blanks open their list on arrival by click (`select.pointer`) or insert (`input.directive.insert`), and by Tab/Enter, but not on plain arrow keys, so moving through a line never pops a list uninvited.
