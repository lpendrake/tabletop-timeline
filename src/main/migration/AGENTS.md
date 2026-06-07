# `src/main/migration/` — Campaign Migration Framework

Automatically upgrades campaigns from older versions of the data format to the current
version whenever a campaign is opened. Each migration is a discrete, idempotent step
that the framework runs once, in order, before the entity index is built.

## Directory layout

```
migration/
  migration.ts               # Migration interface (the contract)
  migration-log.ts           # appendMigrationLog helper — call from inside run()
  campaign-version.ts        # getCampaignVersion / setCampaignVersion helpers
  registry.ts                # MIGRATIONS array + LATEST_VERSION constant
  build-migration-tasks.ts   # Core of the framework: produces NamedTask[]
  AGENTS.md                  # This file
  migrations/
    0001-sample-migration.ts # Template migration — demonstrates summary + log; targetVersion 1
  __tests__/
    campaign-version.test.ts
    build-migration-tasks.test.ts
    migration-log.test.ts
```

## The `Migration` interface

```ts
interface Migration {
  name: string;          // User-visible task name in the load overlay; title-case prose
  targetVersion: number; // Positive integer; unique across all migrations
  run: (
    campaignPath: string,
    onProgress: (completed: number, total: number) => void,
  ) => Promise<string> | string;
}
```

- `run` **must be idempotent** — running it twice on the same campaign must leave
  the campaign in exactly the same state as running it once.
- `run` **must throw** if it encounters data it cannot convert — never silently skip.
  Throwing causes `CampaignLoader` to emit `campaign:loadError` and surfaces the
  problem to the user without corrupting the campaign's recorded version.
- `run` **must return a short human-readable summary string** describing what it did.
  This string is displayed to the user in the post-load notification (e.g.
  `"renamed 3 files"`, `"updated 12 frontmatter entries"`). Return `"no changes"` for
  a no-op migration.

## Two reporting mechanisms (independent of each other)

### 1. Summary string (notification)

The string returned by `run` is collected by the framework and surfaced to the user
after loading completes. It describes the migration at a high level. Use concise,
user-friendly prose.

### 2. Action log (per-migration NDJSON file)

For a debuggable, potentially-reversible record, call `appendMigrationLog` from
`migration-log.ts` for each discrete action the migration takes:

```ts
import { appendMigrationLog } from '../migration-log.js';

appendMigrationLog(campaignPath, '0002-my-migration', {
  renameFile: { oldPath: 'events/a.md', newPath: 'events/b.md' },
});
```

- Each call appends one JSON line to `<campaignPath>/migration-log/<logName>.log.json`.
- **Always pass campaign-relative paths** (e.g. `'events/some-event.md'`), never
  absolute paths or full file contents — keep entries small and root-relative.
- The `logName` argument should be the migration's file stem, e.g. `'0002-my-migration'`.

These two mechanisms are independent: the summary string goes through the framework's
return value; the log file is written directly by the migration via `appendMigrationLog`.
The sample migration (`0001-sample-migration.ts`) demonstrates both.

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

1. Create `src/main/migration/migrations/NNNN-<kebab-description>.ts` exporting a
   `Migration`, where `NNNN` is the zero-padded 4-digit target version number (e.g.
   `0002-my-migration.ts`). This prefix keeps files sort-friendly. Use
   `0001-sample-migration.ts` as the template.
   - Choose the next integer for `targetVersion` (look at `LATEST_VERSION` in
     `registry.ts`).
   - Make `run` idempotent and throw on unrecoverable data.
   - Return a summary string (e.g. `"renamed 3 files"` or `"no changes"`).
   - Call `appendMigrationLog(campaignPath, 'NNNN-my-migration', entry)` for each
     discrete action to leave a debuggable NDJSON trail.
2. Import your migration in `registry.ts` and append it to the `MIGRATIONS` array.
   The sort in `registry.ts` ensures order — but keeping the array in ascending order
   by convention is clearer.
3. Add tests in `__tests__/` covering the new migration's logic and idempotency.

`LATEST_VERSION` is automatically derived from `MIGRATIONS`, so no manual update is needed.

## Conventions

- File names: kebab-case `.ts` (no React, no Electron APIs — pure Node.js file I/O).
- Relative imports use `.js` extensions (NodeNext ESM).
- Use `readJsonObject` / `writeJsonObject` from `../settings/settings-json.js` for all
  `settings.json` access — never call `fs` directly for that file.
- Do not modify files outside `src/main/migration/` from within a migration; if
  broader wiring is needed (e.g. stamping new campaigns), update the relevant IPC
  handler separately.
