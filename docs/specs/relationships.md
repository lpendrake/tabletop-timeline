# [Epic] Relationships view

A third top-level view alongside Timeline and Notes for tracking how entities feel about each
other, on tracks the user defines themselves.

---

## 1. Why this shape

The obvious implementation is "a reputation number between two notes". That solves PF2E and
nothing else. The proposal here is to build a **track definition framework** — the same shape the
codebase already uses for calendars (`src/shared/calendar/`: authoring `spec.ts` → resolved
`calendar.ts`, `registry.ts` merging built-in system specs with user specs) — so that PF2E
reputation ships as *one built-in track* and everything else is the user filling in the same form.

Two decisions drive everything below:

**Relationships are directed edges.** `A → B` and `B → A` are separate values. The trickster/mark
case is the motivating example: the mark holds `Friendly` toward the trickster, the trickster holds
`Contempt` toward the mark. Symmetry is opt-in per track (`Married to` is symmetric), never assumed.

**Values are event-sourced, not overwritten.** This is the thing that makes the feature belong in
*this* app rather than in any generic CRM. Each change is an entry with an in-game timestamp; the
current value is a fold of entries up to `in_game_now_seconds`. That buys, for near-zero extra
cost: relationship history, "how did the Iron Circle feel about us at the Battle of Dawn?", change
markers on the timeline, and an audit trail of *why* a value moved. Retrofitting event-sourcing
onto a mutable field later is a migration; doing it on day one is a slightly bigger frontmatter
schema.

---

## 2. Domain model

Three concepts, in dependency order.

### 2.1 Track definition

The reusable ruleset. Campaign-level, stored in `relationships/tracks.json`, editable in campaign
settings, seeded with built-ins the user can clone and modify.

```ts
interface TrackDefinitionBase {
  id: string;                    // 4-char [a-z0-9], reserved prefix for system tracks
  name: string;                  // "Reputation", "Trust", "Blood debt"
  kind: TrackKind;
  description?: string;
  directionality: 'directed' | 'symmetric';
  display?: DisplayHints;        // bar | pips | chip | ladder | dial, colour source, compact form
  modifiers?: TrackModifiers;    // §4
}
```

> **Scoping decision (recommended, see §10):** v1 folds "the scale" and "the thing being measured"
> into this single `TrackDefinition`. In practice a user's scale name *is* the aspect name
> ("Reputation", "Trust"). Reuse comes from cloning a track, not from a separate binding layer.
> Splitting into `Scale` + `Aspect` later is a mechanical migration; splitting now doubles the
> authoring UI for a benefit nobody has asked for yet.

### 2.2 Relationship edge

An ordered pair of entities plus the values held on it. Entities are note IDs from the existing
entity index (`src/shared/entity-index-entry.ts`) — no new entity concept.

### 2.3 History entry

`{ at, set | delta, note?, event? }`. `at` is epoch-seconds on the campaign calendar, the same unit
as event `epochSeconds` and `in_game_now_seconds`.

---

## 3. The track kinds

`numeric` alone covers the three shapes originally asked for. The rest are the answer to "is there
another way to track relationship status".

### 3.1 `numeric` — plain, banded, or hidden-value

One kind covers all three of the requested cases, because the difference is display, not data.

```ts
interface NumericTrack extends TrackDefinitionBase {
  kind: 'numeric';
  min: number | null;            // null = unbounded
  max: number | null;
  step: number;                  // granularity of +/- controls, default 1
  initial: number;
  bands?: Band[];                // labelled ranges — the PF2E case
  showValue: boolean;            // false ⇒ renders as a pure label track
}

interface Band {
  from: number;                  // inclusive
  to: number | null;             // inclusive; null = open to max/∞
  label: string;                 // "Ignored", "Liked", "Admired"
  color?: string;                // user data, hex allowed (as in tags.json)
  description?: string;          // shown on hover — "may call in one favour"
}
```

| Requested case | Config |
|---|---|
| Just a number, 0–50, starts 0 | `min: 0, max: 50, initial: 0`, no bands |
| Just a number, unbounded | `min: null, max: null` |
| Number with labelled ranges (PF2E) | bands `[-∞,-5] Hostile`, `[-4,4] Ignored`, `[5,14] Liked` … |
| Number where the label is all that shows | as above + `showValue: false` |

**PF2E reputation ships as a built-in track**, unmodifiable but clonable, exactly as Golarion ships
as a built-in calendar.

### 3.2 `ordinal` — a ladder of rungs

```ts
interface OrdinalTrack extends TrackDefinitionBase {
  kind: 'ordinal';
  steps: { label: string; color?: string; description?: string }[];
  initial: number;               // index
  allowSkip: boolean;            // can a change jump rungs, or only ±1?
}
```

`Hated → Unfriendly → Neutral → Friendly → Helpful`. Storage is an index, so inserting a rung is an
edit to `steps`, not a renumbering of every stored value.

> An ordinal track is mathematically a banded numeric with unit-width bands and `showValue: false`.
> It is kept as a **separate authoring shape** because the editing experience is completely
> different — "list your rungs" vs "define ranges" — but both **compile to the same resolved
> runtime type** (§5). One renderer, one set of maths, two forms.

### 3.3 `categorical` — unordered

```ts
interface CategoricalTrack extends TrackDefinitionBase {
  kind: 'categorical';
  options: { label: string; color?: string; description?: string }[];
  multiple: boolean;             // single choice, or a tag-set
  initial: string[];
}
```

The important structural difference from `ordinal`: **no ordering**, therefore no "improve /
worsen" semantics and no `+`/`−` controls. This is how you say `Rival`, `Blood-debt owed`,
`Betrothed`, `Sworn enemy` — relationship *type* rather than relationship *strength*. Most tables
need both, on the same pair, which is why a pair carries many tracks.

### 3.4 `toggle` — a flag

`{ onLabel, offLabel, initial }`. Degenerate categorical, first-classed because it renders as a
switch and reads well in a matrix: *"Knows the party's true identity"*, *"Has a standing invitation"*.

### 3.5 `clock` — a filling, consumable track

```ts
interface ClockTrack extends TrackDefinitionBase {
  kind: 'clock';
  segments: number;              // 4, 6, 8 …
  initial: number;
  onFill: 'hold' | 'reset' | 'advance';   // advance ⇒ bump a linked track by 1
  fillLabel?: string;            // "The Iron Circle declares war"
}
```

Blades-in-the-Dark style. Genuinely different from bounded numeric because it is **goal-oriented and
consumable** — it fills toward an outcome, fires, and resets. Models "the faction is building toward
something" in a way a reputation bar cannot.

### 3.6 `state` — a transition graph

```ts
interface StateTrack extends TrackDefinitionBase {
  kind: 'state';
  states: { key: string; label: string; color?: string }[];
  transitions: { from: string; to: string; label?: string }[];
  initial: string;
}
```

A ladder is a line; this is a **graph**. `Strangers → Acquaintances → Friends → Estranged →
Reconciled`, where `Reconciled` is only reachable from `Estranged` and you can never return to
`Strangers`. The UI only offers legal next states, which is a genuinely different — and, at the
table, very useful — kind of constraint. This is the strongest "beyond numbers and labels" answer.

### 3.7 `composite` — multi-axis, with a lookup label

```ts
interface CompositeTrack extends TrackDefinitionBase {
  kind: 'composite';
  axes: { key: string; trackId: string; label: string }[];
  matrix?: { when: Record<string, string | [number, number]>; label: string; color?: string }[];
}
```

Real relationships are not one number. `Trust × Fear`, `Affinity × Influence`, `Attitude ×
Awareness`. Each axis is an existing track; the optional matrix derives a headline label from the
combination:

| | low Fear | high Fear |
|---|---|---|
| **high Trust** | Devoted | Loyal but wary |
| **low Trust** | Indifferent | Cowed |

The first matching `when` row wins, so it degrades gracefully with partial coverage. This is the
generalisation of the "combo" case the ticket asks about, one dimension further out.

### 3.8 `freeform` — no quantification

Just a directed labelled edge with body text: *"owes a life debt to"*. The zero-friction default,
so a user can map the web of who-knows-whom before deciding whether any of it needs numbers. **This
should be the kind a new relationship gets by default** — the fastest path from "open the view" to
"something on screen" must not require designing a track first.

---

## 4. Cross-cutting modifiers

Orthogonal to kind, so they compose with all of the above. Each is independently shippable and
none is in the v1 slice.

| Modifier | Shape | Why it earns its place |
|---|---|---|
| **Decay** | `{ towards, amountPerSeconds }` | Values drift to a resting point as in-game time passes. Only feasible *because* this app owns a clock — reputation cools when the party leaves town for six months. |
| **Ratchet** | `{ floor?, ceiling?, afterReaching }` | One-way locks: "once Hated, cannot rise past Unfriendly without a quest." Encodes that trust is hard to regain. |
| **Asymmetric movement** | `{ gainMultiplier, lossMultiplier }` | Easy to lose, hard to gain, without hand-maths. |
| **Thresholds** | `[{ at, message, emitEvent? }]` | Crossing a boundary raises a toast and can auto-create a timeline event, so the story beat lands where the GM will see it. |
| **Visibility** | `'gm' \| 'shared'` (per edge, not per track) | A GM tool needs to distinguish "what the faction actually thinks" from "what the players have worked out". |

---

## 5. Authoring spec → resolved track

Mirrors `spec.ts` → `calendar.ts` in the calendar module. The union above is the **authoring**
shape; every kind compiles to one **resolved** shape that the whole renderer talks to:

```ts
interface ResolvedTrack {
  id: string;
  name: string;
  domain: 'scalar' | 'set' | 'state' | 'composite' | 'none';
  initial: TrackValue;
  clamp(value: TrackValue): TrackValue;
  labelFor(value: TrackValue): { label: string; color?: string; description?: string } | null;
  format(value: TrackValue): string;          // "12 (Liked)" | "Friendly" | "3/6"
  adjust(value: TrackValue, delta: number): TrackValue;
  legalNext(value: TrackValue): TrackValue[]; // state tracks; all-reachable elsewhere
  positions(): { at: number; label: string; color?: string }[];  // for bar/ladder rendering
}
```

Every renderer, the matrix cells, the note panel and the timeline markers consume `ResolvedTrack`
only. Adding a ninth kind means one new `resolve*` function and zero renderer changes.

`resolveTrack(id, customTracks)` mirrors `resolveCalendar`: system tracks first, then campaign
tracks, then a safe fallback.

---

## 6. On-disk format

`relationships/` already exists (created by `src/main/ipcHandlers.ts:169`, currently unused).

```
relationships/
  tracks.json          # track definitions (the registry — like tags.json)
  a1b2--c3d4.md        # one file per entity *pair*, IDs lexically sorted
```

**One file per unordered pair**, holding both directions. The filename is deterministic from the
sorted IDs, so no lookup is needed to find a pair's file and two clients cannot create rival files
for the same pair. Both directions living together is what makes the asymmetry legible in the raw
file — the trickster case is visible at a glance in git.

```yaml
---
id: r7m3                       # 4-char, same generator as notes/events
entities: [a1b2, c3d4]         # canonical sorted order
edges:
  - track: rep0                # track definition id
    from: a1b2                 # the Iron Circle
    to: c3d4                   # the party
    history:
      - at: 148975200
        delta: 4
        event: e5f6            # optional link to a timeline event
        note: Recovered the stolen relic
      - at: 151000000
        set: 0
        note: Session zero reset after the retcon
  - track: rep0
    from: c3d4
    to: a1b2
    history: []
---

Free markdown. GM notes about this pair, wiki links, the works.
```

Notes:

- Markdown-with-frontmatter, not JSON, so a relationship gets a body, an ID, wiki-link and peek
  support for free, and diffs readably in git — consistent with how notes and events are stored.
- The current value is **derived**, never stored: fold `history` entries with `at <= now`, in `at`
  order, starting from the track's `initial`. `set` replaces, `delta` adjusts.
- History is capped in the UI, not the format; tabletop volumes are dozens of entries per edge.
- **Orphans**: if a referenced note is deleted, keep the file and render the endpoint as an unknown
  entity with a cleanup affordance — the same forgiving posture `resolveEntityTagLabel` takes for
  unknown entity tags.

---

## 7. Code layout

Follows the existing module conventions; nothing here is a new pattern.

| Path | Contents |
|---|---|
| `src/shared/relationships/spec.ts` | Authoring types for every track kind. Pure. |
| `src/shared/relationships/resolve.ts` | `spec → ResolvedTrack` per kind. Pure, heavily unit-tested. |
| `src/shared/relationships/fold.ts` | `history + now → current value`. Pure. |
| `src/shared/relationships/system/` | Built-ins: PF2E reputation, attitude ladder, trust/fear composite. |
| `src/shared/relationships/registry.ts` | `resolveTrack(id, custom)` — mirrors `resolveCalendar`. |
| `src/main/relationships-store.ts` | Read/write `relationships/`, parse frontmatter, build the edge index. |
| `src/main/relationships-ipc-handlers.ts` | IPC registrars, wired from `ipcHandlers.ts`. |
| `src/main/index.ts` | One new `LoadingTask` to index relationships at campaign open (use the `add-loading-task` skill). |
| `src/renderer/relationships/data.ts` + `ports.ts` | IPC boundary, mirroring `timeline/data/ports.ts`. |
| `src/renderer/relationships/domain/` | Matrix building, sorting, grouping. Pure. |
| `src/renderer/relationships/components/` | Track renderers (bar, ladder, pips, chip, dial, clock, state). |
| `src/renderer/relationships/hooks/` | Wiring only — no logic in hook bodies, per `CLAUDE.md`. |
| `src/renderer/views/relationships/relationships-view.tsx` | Replaces the current placeholder stub. |
| `src/renderer/views/settings/` | Track designer, sitting beside the calendar editor. |
| `src/renderer/theme/types.ts` + `dark-pathfinder.ts` | New `relationships` theme section. No hardcoded hex in code. |

Also required: `resolve-default-view.ts` currently maps `'relationships'` to `'timeline'` as
out-of-scope, with a test asserting it
(`src/renderer/views/settings/domain/__tests__/resolve-default-view.test.ts:25`). Both flip when
the view ships.

---

## 8. UI surfaces

1. **Matrix** — entities × entities grid, cells showing the resolved chip/bar. The "party vs every
   faction" view, and where asymmetry is most visible (the cell above the diagonal differs from the
   one below).
2. **Focus** — pick one entity, get two columns: *how they see others* / *how others see them*.
   The primary editing surface.
3. **Graph** — force-directed node/edge map. The placeholder stub already promises "mind-map of
   connections". Highest cost, lowest information density; last.
4. **Track designer** — in campaign settings, one form per kind, with a live preview of the track
   rendering as you edit it. This *is* the feature, from the user's point of view.
5. **In the note meta-panel** — a relationships strip on an NPC's note, so reputation is adjustable
   while reading about the NPC. Low cost, high use; should not wait for phase 3.
6. **Timeline integration** — optional change markers on the timeline; and, because values are
   event-sourced, an "as of the current in-game moment" reading that changes when the GM moves the
   now-line.

---

## 9. Suggested child tickets

| # | Ticket | Slice |
|---|---|---|
| 1 | Track definition spec + resolver | `src/shared/relationships/`, `numeric` + `ordinal` only, built-in PF2E track, full unit tests. No UI. |
| 2 | Storage + IPC + load task | Pair-file read/write, `tracks.json`, edge index, campaign loader task. |
| 3 | Focus view, read-only | Render one entity's inbound/outbound edges. Proves the resolver end to end. |
| 4 | Editing + history | Adjust a value, write a history entry stamped at in-game now, undo. |
| 5 | Track designer | Settings UI for numeric + ordinal, clone-a-built-in flow, live preview. |
| 6 | Matrix view | Grid, filtering, track switcher. |
| 7 | `categorical` + `toggle` | Second and third kinds through the same pipeline — the real test that the framework is a framework. |
| 8 | Note meta-panel strip | Relationships where the GM is already reading. |
| 9 | Timeline integration | Change markers, as-of scrubbing. |
| 10 | `clock`, `state`, `composite` | One ticket each, independent. |
| 11 | Modifiers | Decay, ratchets, thresholds, visibility. One ticket each. |
| 12 | Graph view | The mind-map. |

**Minimum viable epic is tickets 1–5**: PF2E reputation works end to end, and a user can define a
plain numeric or ladder track of their own. Everything after that is the framework paying out.

---

## 10. Open decisions

1. **Track vs Scale+Aspect** — recommend folding them (§2.1). Confirm before ticket 1, since it
   shapes `tracks.json`.
2. **Track library scope** — campaign-level (`relationships/tracks.json`), workspace-level (like
   `calendars.json`, shared across campaigns), or campaign-level with import-from-workspace?
   Recommend campaign-level for v1 with the file shaped so a workspace library can be layered on.
3. **Pair file vs per-entity file** — recommend per-pair (§6). Per-entity gives fewer files but
   splits the asymmetric pair across two files, which is exactly the thing worth seeing together.
4. **Do relationship changes emit timeline events?** Recommend opt-in per track, off by default —
   an always-on version would flood the timeline.
5. **Do non-note entities ever need relationships?** (a relationship *with a place*, or with an
   event). Notes-only for v1; the model is IDs, so widening later costs nothing.
6. **Group entities** — is "the party" a note, or a first-class group of notes? Recommend: a note,
   for v1. A group concept is its own epic.
