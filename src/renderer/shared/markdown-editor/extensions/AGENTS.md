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

## Decoration lifecycle

`wikiLinks(config)` returns an `Extension` bundle. The core is a `StateField<DecorationSet>` that calls `buildDecorations(state, config)` whenever:

- the document changes (`transaction.docChanged`)
- the selection changes (`transaction.selection`) — needed to toggle raw vs. widget rendering for the cursor-is-inside case
- a `setKnownIds` or `setEntityLabels` effect arrives

### Widget rendering — `WikiLinkWidget`

For every link whose range does **not** overlap the current selection, `buildDecorations` inserts a `Decoration.replace` wrapping a `WikiLinkWidget`. The widget renders a `<span>` with:

- `class="cm-note-link"` (or `cm-note-link cm-note-link-broken` for a missing entity)
- `data-note-id="{id}"` — used by peek and click handlers
- `textContent` set via the **label resolution chain**:
  1. Local label from `[[label|id]]` if present
  2. Lookup in `entityLabelMapField` by id
  3. Raw id as fallback

When the cursor is inside the link range, the range gets a `Decoration.mark({ class: 'cm-wiki-link-raw' })` instead, exposing the raw source so the user can edit it. In `readOnly` mode the selection check is skipped and links always render as widgets.

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

**Cmd/Ctrl-click** on a rendered `.cm-note-link` span also calls `config.onOpen(id)`.

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
- **Decoration rebuilds on selection change.** The raw-vs-widget switch needs selection tracking. This is intentional; don't remove the `transaction.selection` check from the StateField update guard.
