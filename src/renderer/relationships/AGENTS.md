# Relationships view

The Relationships view shows relationship values derived from directives, one tab per track; read-only.

## Tab architecture

`views/relationships/relationships-view.tsx` builds the toolbar and passes it to the active tab's layout, which places it. The view also composes:

- `components/top-bar.tsx` — tabs, as-of date, problems badge

The toolbar (`components/toolbar.tsx`) holds the Holder/Toward picker built on `shared/searchable-picker`, scoped search, and sort buttons. The sort buttons serve ordinal and categorical tabs only; numeric tabs have none and sort by clicking column titles (below). The numeric tab places the toolbar in its sticky header; the placeholder layout renders it above the body.

State comes from `hooks/use-relationships.ts`, which only wires pure `domain/` functions to React.

## Layout by kind

- Numeric tabs: `components/numeric-tab/` — a sticky header (the toolbar slot plus column titles and axis labels), one row per relationship, and a plot on an axis shared by every row of the tab; expanded rows show a placeholder line until history arrives
  - Info-panel columns, left to right: drag handle, Entries (the boxed `▸ n` expand toggle), Last change, Standing with, Band (only with bands), Value; then the plot. Header and row cells both come from `visibleColumns` in `domain/numeric-columns.ts` and share the grid set from `columnTemplate` as `--rel-num-template`
  - Sorting: each column title is a button calling `sortByColumn` (`hooks/use-relationships.ts`); `RowSort` and `columnSortOf` in `domain/sort.ts` give the active column and direction. Clicks cycle natural direction, flipped, then back to My order, the only sort that shows drag handles
  - Resizing: a grip on each title's right edge (drag, double-click to reset, Left/Right ±8px) wired by `hooks/use-column-resize.ts`. Widths and limits live in `domain/numeric-columns.ts`; `hooks/use-column-widths.ts` remembers them per campaign. The panel is as wide as its columns and the plot takes the rest
  - Every second row of a group is striped across panel and plot, its expanded line included (the stripe is on the row wrapper); bands behind the plot are tinted with their own colour (`color-mix` of theme vars, no new tokens)
  - The axis labels and each row's plot draw into a `.rel-num-layer`, inset by `--rel-inner-pad` on both sides so a dot or label at either end of the range stays inside and nothing overhangs `.rel-view`; a band, line or dot position is a fraction of that inset box
- Ordinal and categorical tabs: `components/placeholder-tab-body.tsx` is temporary and serves only these until #276–#278 add `components/<kind>-tab/`; it will then be removed
- `relationships-view.tsx` picks the layout from the active track's `kind`

Shared building blocks every tab layout reuses, instead of re-implementing:

- `components/row-controls.tsx` — drag handle, drop-target props, row move menu, Enter/Space activation
- `components/group-header.tsx` — collapsible holder header with its own reorder
- `components/tab-notices.tsx` — empty-state and nothing-matches notice, track problems list
- `hooks/use-row-drag.ts` (`useRowReorder`) — drag-and-drop reorder for a row or group
- `hooks/use-plot-tooltip.ts` — tooltip positioning for plot mouseovers
- `src/renderer/shared/tooltip-position.ts` — tooltip placement

The view is full-bleed: `.rel-view` has no padding, and the top bar's tabs, the toolbar, rows and notices keep `--rel-inner-pad` (set on `.rel-view`) from the window edge. Tab bodies own the space below the last row, so track problems add none of their own.

## Files to read first, in order

1. `domain/view-rows.ts`
2. `domain/search.ts`
3. `domain/view-order.ts`
4. `hooks/use-relationships.ts`
5. `domain/scale-colour.ts`
6. `domain/plot-scale.ts`
7. `domain/numeric-rows.ts`

## Rules

- No logic in hooks/components — search tokenising and matching, highlight ranges, sort comparators, tab derivation, picker grouping, scale colour are pure `domain/` functions with tests
- Colours from the theme ramp by position (`scaleNegative/Neutral/Positive`, accent gold when the initial is at the bottom) — specs store no colours, no hex
- Persistence split: selected tab, holder and numeric column widths in localStorage keyed by campaign (`view-state-persistence.ts`), order/expanded/collapsed in `relationships/view-order.json` keyed by track + holder (`rp01:<holderId>`, `rp01:*`, `tg01:entity-cards`), sparse and advisory (unlisted rows append alphabetically, stale entries ignored and kept)
- History steps computed only for expanded or search-opened rows
- Titles from the relationship index's path → title map
- Problems badge counts only invalid directives (unfinished drafts never reported)
- Names open the entity note on plain click, with hover peek
- Keyboard: tablist Left/Right, Escape closes pickers/popovers and returns focus, Enter/Space expands rows
- The view never edits values

## Editor integration

Files `editor-menu.ts`, `editor-host-config.ts`, `hooks/use-relationship-editor-config.ts` belong to directive editing, not this view. The held-tags and track-usage completions are fed by the `heldTags` and `trackUsage` resolvers in `editor-host-config.ts`, whose pure folds live in `domain/held-options.ts` and `domain/track-usage.ts`.
