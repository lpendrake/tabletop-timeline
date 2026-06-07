# `src/main/migrations/` — Campaign Migration Framework

Automatically upgrades campaigns from older versions of the data format to the current
version whenever a campaign is opened. Each migration is a discrete, idempotent step
that the framework runs once, in order, before the entity index is built.

## Directory layout

```
migrations/
  migration.ts               # Migration interface (the contract)
  campaign-version.ts        # getCampaignVersion / setCampaignVersion helpers
  sample-migration.ts        # No-op sample: documents the pattern; targetVersion 1
  registry.ts                # MIGRATIONS array + LATEST_VERSION constant
  build-migration-tasks.ts   # Core of the framework: produces NamedTask[]
  AGENTS.md                  # This file
  __tests__/
    campaign-version.test.ts
    build-migration-tasks.test.ts
```

## The `Migration` interface

```ts
interface Migration {
  name: string;          // User-visible task name in the load overlay; title-case prose
  targetVersion: number; // Positive integer; unique across all migrations
  run: (
    campaignPath: string,
    onProgress: (completed: number, total: number) => void,
  ) => Promise<void> | void;
}
```

- `run` **must be idempotent** — running it twice on the same campaign must leave
  the campaign in exactly the same state as running it once.
- `run` **must throw** if it encounters data it cannot convert — never silently skip.
  Throwing causes `CampaignLoader` to emit `campaign:loadError` and surfaces the
  problem to the user without corrupting the campaign's recorded version.

## Versioning model

- A flat integer `version` is stored in the **campaign** `settings.json`
  (`<campaignPath>/settings.json`) alongside `theme` — never in the workspace
  `settings.json`.
- A missing, malformed, or non-integer value is treated as version `0`.
- **New campaigns** should be stamped with `LATEST_VERSION` at creation time (in the
  campaign-creation IPC handler) so they skip all existing migrations on first open.
- Versions only move **forward** — there are no down-migrations.

## How migrations run on open

1. `buildMigrationTasks(campaignPath)` reads the campaign's current `version` from
   its `settings.json` and filters `MIGRATIONS` to those with
   `targetVersion > currentVersion`, returning them as `NamedTask[]` sorted ascending.
2. These tasks are prepended to the `CampaignLoader` task list **before**
   `buildEntityIndex`, ensuring the data is in the current format before the index
   runs.
3. Each task:
   a. Calls `migration.run(campaignPath, onProgress)`.
   b. **Only on success**: calls `setCampaignVersion(campaignPath, migration.targetVersion)`.
4. If a migration throws, `CampaignLoader` emits `campaign:loadError` and rethrows.
   The campaign's version remains at the last successfully-applied migration, so the
   next open attempt resumes from that point.

## How to add a new migration

1. Create `src/main/migrations/<kebab-case-description>.ts` exporting a `Migration`.
   - Choose the next integer for `targetVersion` (look at `LATEST_VERSION` in
     `registry.ts`).
   - Make `run` idempotent and throw on unrecoverable data.
2. Import your migration in `registry.ts` and append it to the `MIGRATIONS` array.
   The sort in `registry.ts` ensures order — but keeping the array in ascending order
   by convention is clearer.
3. Add tests in `__tests__/` covering the new migration's logic and idempotency.

`LATEST_VERSION` is automatically derived from `MIGRATIONS`, so no manual update is needed.

## Conventions

- File names: kebab-case `.ts` (no React, no Electron APIs — pure Node.js file I/O).
- Relative imports use `.js` extensions (NodeNext ESM).
- Use `readJsonObject` / `writeJsonObject` from `../settings-json.js` for all
  `settings.json` access — never call `fs` directly for that file.
- Do not modify files outside `src/main/migrations/` from within a migration; if
  broader wiring is needed (e.g. stamping new campaigns), update the relevant IPC
  handler separately.
