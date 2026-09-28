# `src/renderer/shared/searchable-picker/` — Generic Searchable Picker

A reusable search-input-over-a-ranked-list component. Used by the New Note
dialog for folder selection; intended to also back note and tag pickers
later, so options are generic: `{ id, path, label? }`.

## Files

- `picker-model.ts` — PURE. `rankPickerOptions` (empty query → recents first,
  in `recentIds` order, then the rest in input order; non-empty query →
  path-aware filter/sort via `shared/search` — `matchPath` for matching,
  `compareRanked` for ordering) and `moveHighlight` (wrapping index math).
- `searchable-picker.tsx` — the component. Holds only UI state (query text,
  highlighted index); all ranking/ordering logic is delegated to
  `picker-model.ts`.
- `searchable-picker.css` — colours only via `var(--theme-*)` tokens, no
  hardcoded hex/rgb.

## Matching

Matching is path-aware: a query is split on `/` and each segment must match
a successive path segment of the option's `path` (see
`shared/search/path-match.ts`), so `storm/spies` finds
`factions/the-house-of-storms/spies` without requiring every intermediate
folder to be typed. This is `rankPickerOptions`, the default — built for the
New Note folder picker.

## Pinned groups, counts, highlight

- `pinned?: PickerOption[]` renders a labelled Pinned group before the All
  group (`pinnedLabel` / `allLabel`, default "Pinned" / "All"). Empty query:
  pinned in the given order, All in the caller's order (caller pre-sorts, e.g.
  by count). With a query both groups are filtered/ranked and empty groups
  dropped. Without `pinned` there are no headers — the picker renders as a
  flat list. Grouping is `groupPickerOptions`.
- An option may be in both groups; both rows are kept.
- **Flat-index rule:** highlight state is one index into
  `flattenGroups(groups)` (headers excluded), so Up/Down skip headers and
  wrap across groups, and a duplicated option has two distinct indexes. Rows
  carry `data-index`; scroll-into-view looks up `[data-index]` — never
  `children[highlight]`, since headers are children too.
- `PickerOption.count` renders muted on the right of the row.
- `highlightMatches` wraps the typed text in `<mark class="searchable-picker-match">`
  using `highlightSegments` (built on `matchRanges` in `shared/search/rank.ts`,
  all case-insensitive occurrences of the trimmed query in the label).

## Recents

When the query is empty, options whose id is in `recentIds` are shown first
(in `recentIds` order), followed by the rest in their original order.
Recents never reorder actual search results — they only affect the
empty-query view.

## Key handling contract

- `ArrowUp` / `ArrowDown` move the highlight (via `moveHighlight`), wrapping
  across the ranked results.
- `Enter` picks the highlighted option; does nothing when there are no
  results. Calls `preventDefault()` + `stopPropagation()`.
- `Escape` calls `onCancel`, with `preventDefault()` + `stopPropagation()` so
  a surrounding modal doesn't also close on the same key event.
- Mouse hover highlights a row; `mousedown` (not `click`) on a row picks it,
  with `preventDefault()` so the input keeps focus.

## Don't

- Don't put ranking/sorting/filtering logic in the component — it belongs in
  `picker-model.ts`, which is plain data in/data out and unit-testable
  without mounting React.
- Don't hardcode colours — add a token to the theme system first if one is
  missing (see `src/renderer/theme/AGENTS.md`).
