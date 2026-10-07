# Relationships view

The Relationships view shows relationship values derived from directives, one tab per track; read-only.

## Tab architecture

`views/relationships/relationships-view.tsx` builds the toolbar and passes it to the active tab's layout, which places it. The view also composes:
- `components/top-bar.tsx` — tabs, as-of date, problems badge

The toolbar (`components/toolbar.tsx`) holds the Holder/Toward picker built on `shared/searchable-picker`, scoped search, and sort. The numeric tab places the toolbar in its sticky header; the placeholder layout renders it above the body.

State comes from `hooks/use-relationships.ts`, which only wires pure `domain/` functions to React.

## Layout by kind

- Numeric tabs: `components/numeric-tab/` — a sticky header (the toolbar slot plus column and axis labels), one row per relationship, and a plot on an axis shared by every row of the tab; expanded rows show a placeholder line until history arrives
- Ordinal and categorical tabs: `components/placeholder-tab-body.tsx` is temporary and serves only these until #276–#278 add `components/<kind>-tab/`; it will then be removed
- `relationships-view.tsx` picks the layout from the active track's `kind`

Shared building blocks every tab layout reuses, instead of re-implementing:
- `components/row-controls.tsx` — drag handle, drop-target props, row move menu, Enter/Space activation
- `components/group-header.tsx` — collapsible holder header with its own reorder
- `components/tab-notices.tsx` — empty-state and nothing-matches notice, track problems list
- `hooks/use-row-drag.ts` (`useRowReorder`) — drag-and-drop reorder for a row or group
- `hooks/use-plot-tooltip.ts` — tooltip positioning for plot mouseovers
- `src/renderer/shared/tooltip-position.ts` — tooltip placement

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

Files `editor-menu.ts`, `editor-host-config.ts`, `hooks/use-relationship-editor-config.ts` belong to directive editing, not this view.
