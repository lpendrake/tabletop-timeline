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
folder to be typed.

## Recents

When the query is empty, options whose id is in `recentIds` are shown first
(in `recentIds` order), followed by the rest in their original order.
Recents never reorder actual search results — they only affect the
empty-query view.

## Key handling contract

- `ArrowUp` / `ArrowDown` move the highlight (via `moveHighlight`), wrapping.
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
