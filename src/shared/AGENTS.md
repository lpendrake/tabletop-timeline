# `src/shared/` — Shared Utilities

Cross-cutting helpers used by both the renderer and any future main-process code. No React, no IO.

## Entity tags (system-generated tags)

**Intent:** when a user links an entity (NPC, location, plot thread, etc.) inside an event body, the
app auto-adds a filterable tag so every event connected to that entity can be found via tag
filtering. These are called *system-generated tags* in user-facing copy — users do not need to know
the word "entity".

### Format

```
id:XXXX
```

`id:` prefix followed by a 4-character lowercase alphanumeric entity ID (e.g. `id:ab12`). The
format is enforced by `/^id:[a-z0-9]{4}$/`.

### Utility functions — `entity-tags.ts`

| Function | Purpose |
|---|---|
| `isEntityTag(tag)` | Returns `true` if `tag` matches the `id:XXXX` format. |
| `parseEntityTag(tag)` | Returns the 4-char ID, or `null` if not an entity tag. |
| `formatEntityTag(id)` | Produces the canonical `id:XXXX` string from a bare ID. |
| `isValidCustomTag(tag)` | Returns `true` only for user-entered tags — rejects anything matching `id:XXXX` or `sesh:*`. |
| `resolveEntityTagLabel(raw, map)` | Looks up a display label from an entity-ID→label `Map`. Returns `{ display, isEntity }`. Falls back to the raw tag string if the ID is unknown or the map is absent. |
| `extractWikiLinkIds(body)` | Scans a markdown body for `[[...]]` links, extracts valid 4-char entity IDs (handles `[[id]]` and `[[label\|id]]` forms), deduplicates. |
| `syncEntityTags(existingTags, linkedEntityIds)` | Derives the full tag list for an event on save: strips all existing entity tags, keeps custom tags, then appends one `id:XXXX` tag per linked entity ID. Stale entity tags (whose link was removed) are discarded automatically. |

### Session tags

A second reserved namespace `sesh:*` is used for session tags. `isSessionTag` and `isValidCustomTag`
both treat these as system-reserved so users cannot create or remove them via the tag UI.

### Lifecycle: how entity tags are written

On every save, `bufferToFrontmatter` in `src/renderer/timeline/event-editor/domain.ts`:

1. Calls `extractWikiLinkIds(buf.body)` to find every entity referenced in the body.
2. Passes the result to `syncEntityTags(customTags, linkedIds)`, which rebuilds the entity-tag
   subset from scratch.
3. Appends session tags (`buf.systemTags`) that are managed separately.
4. Writes the combined list to `EventFrontmatter.tags`.

### Validation guard

`hasReservedTagPrefix` (also in `event-editor/domain.ts`) rejects user-typed tags that match any
reserved prefix by calling `isValidCustomTag`. This prevents users from manually crafting `id:XXXX`
entries in the tag input field.

### Display: label resolution

Entity tags are **never shown as raw `id:XXXX` strings** in the UI. Every display site receives an
`entityTagLabelMap: Map<string, string>` (entity ID → human-readable name) and calls
`resolveEntityTagLabel` to get the `display` string. If the entity is not in the map the raw tag
is shown as a fallback.

Display sites:
- `src/renderer/timeline/render/cards.tsx` — tag chips on event cards; entity tags get CSS class
  `entity-tag-chip--resolved` and their remove button is hidden (only custom tags are removable).
- `src/renderer/timeline/filter/tag-editor.tsx` — tag filter picker; entity tags display their
  resolved name and receive class `filter-tag-result--entity`.
- `src/renderer/timeline/event-editor/domain.ts` — `buildTagChips` assembles the chip list shown
  in the editor preview.

## Key files

| File | Role |
|---|---|
| `src/shared/entity-tags.ts` | All entity-tag and wiki-link utilities. No IO, no React. |
| `src/shared/__tests__/entity-tags.test.ts` | Unit tests for every exported function. |
| `src/renderer/timeline/event-editor/domain.ts` | `bufferToFrontmatter`, `hasReservedTagPrefix`, `buildTagChips` — consumes the utilities on save and in the editor. |
| `src/renderer/timeline/filter/tag-editor.tsx` | Tag filter UI; resolves entity-tag labels for the picker. |
| `src/renderer/timeline/render/cards.tsx` | Renders tag chips on timeline cards; resolves labels and suppresses remove button for entity tags. |
| `src/renderer/timeline/data/types.ts` | `EventFrontmatter.tags?: string[]` — the storage field; entity, session, and custom tags all live here. |

## Don't

- Don't display raw `id:XXXX` strings to users — always pass through `resolveEntityTagLabel`.
- Don't let users add entity-format tags via the tag input — `isValidCustomTag` is the guard.
- Don't manually maintain entity tags — call `syncEntityTags` on save; it is the single source of
  truth for which entity tags an event should have.
- Don't put any IO or React imports in `entity-tags.ts` — it must stay pure so it can be used
  anywhere.
