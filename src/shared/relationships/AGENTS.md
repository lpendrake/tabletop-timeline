# `src/shared/relationships/` — Relationship Tracks

Pure, IO-free, framework-free TypeScript. Defines track kinds (PF2E Reputation, Attitude,
Relationship tags), validates their action templates, compiles a `TrackSpec` into a
`ResolvedTrack`, and folds a ledger's deltas into the current value as of a point in in-game
time. Directives are parsed elsewhere; this module never reads a note or event body.

## Read first

1. `spec.ts` — authoring types (`TrackSpec` and friends). Plain data only.
2. `model.ts` — `RelationshipDelta`, `Ledger`, `TrackValue`. Also plain data.
3. `resolve.ts` — compiles a spec into `ResolvedTrack`, the only shape consumers should use.
4. `current-value.ts` — `currentValue`/`computeValue`, the folding engine.
5. `registry.ts` — `resolveTrack(id, library)`, the single lookup entry-point.

## Invariants

- **Bodies are truth; the index is a cache.** Deltas live in note/event markdown; nothing here
  persists a value. `currentValue` recomputes from the full delta list every call —
  recomputation is total, never incremental.
- **Ledgers are views**, not storage: a `Ledger` is just deltas for one (holder, observer,
  track) grouped for folding. It is assembled by a caller, not owned here.
- **`at` is derived**, from the declaring event's in-game date — never written directly, and
  `null` means undated (declared on a note rather than an event).
- **Mirrors are derived, never written.** A `mutual` categorical option produces a matching
  delta on the paired (observer, holder) ledger elsewhere; this module only marks
  `delta.mirrored` for display, it does not create mirror deltas.
- **The parser reads only the envelope and role tokens** (`{role}`/`{role:Prompt}` blanks) —
  this module validates templates and computes values, it never parses directive text.
- **Holder has the value, observer holds the view**: `(holder, observer)` and
  `(observer, holder)` are separate ledgers on the same track; they are not automatically
  symmetric except via an explicit mirror.
- **Keys are immutable.** `ActionSpec.key`, `BandSpec.key`, `RungSpec.key`, `OptionSpec.key` are
  identity, not display text — never rename a key to "fix" a label; add a new key instead.
- Categorical `format()` on an empty selection returns `''`.

## Don't

- No IO, no React, no Electron imports anywhere in this directory (enforced by a test).
- Don't store computed values — only deltas are ever persisted; everything else is derived.
- Don't add a `default` branch to the `DeltaOp`/op `switch` in `current-value.ts` — the missing
  default is what makes TypeScript catch an unhandled op kind at compile time.
- Consumers use `ResolvedTrack` (via `resolveTrack`/`listTracks`), never a raw `TrackSpec`,
  outside `resolve.ts` and `registry.ts`.
