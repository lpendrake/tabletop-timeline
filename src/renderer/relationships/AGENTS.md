# Relationships view

The Relationships view shows relationship values derived from directives, one tab per track; read-only.

## Tab architecture

`views/relationships/relationships-view.tsx` composes:
- `components/top-bar.tsx` — tabs, as-of date, problems badge
- `components/toolbar.tsx` — Holder/Toward picker built on `shared/searchable-picker`, scoped search, sort
- active tab's body

State comes from `hooks/use-relationships.ts`, which only wires pure `domain/` functions to React.

## Layout by kind

Numeric, ordinal and categorical tab bodies arrive in #275–#278 as `components/<kind>-tab/`; until then `components/placeholder-tab-body.tsx` is temporary and will be removed.

## Files to read first, in order

1. `domain/view-rows.ts`
2. `domain/search.ts`
3. `domain/view-order.ts`
4. `hooks/use-relationships.ts`
5. `domain/scale-colour.ts`

## Rules

- No logic in hooks/components — search tokenising and matching, highlight ranges, sort comparators, tab derivation, picker grouping, scale colour are pure `domain/` functions with tests
- Colours from the theme ramp by position (`scaleNegative/Neutral/Positive`, accent gold when the initial is at the bottom) — specs store no colours, no hex
- Persistence split: selected tab and holder in localStorage keyed by campaign (`view-state-persistence.ts`), order/expanded/collapsed in `relationships/view-order.json` keyed by track + holder (`rp01:<holderId>`, `rp01:*`, `tg01:entity-cards`), sparse and advisory (unlisted rows append alphabetically, stale entries ignored and kept)
- History steps computed only for expanded or search-opened rows
- Titles from the relationship index's path → title map
- Problems badge counts only invalid directives (unfinished drafts never reported)
- Names open the entity note on plain click, with hover peek
- Keyboard: tablist Left/Right, Escape closes pickers/popovers and returns focus, Enter/Space expands rows
- The view never edits values

## Editor integration

Files `editor-menu.ts`, `editor-host-config.ts`, `hooks/use-relationship-editor-config.ts` belong to directive editing, not this view.
