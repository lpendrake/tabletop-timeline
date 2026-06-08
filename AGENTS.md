# tabletop-timeline

## Campaign On-Disk Format

This document is the entry point for AI agents. It covers what a campaign is on disk, how files are structured, and how the ID system works.

## What a campaign is

A campaign is a directory inside a user-chosen root folder. The app scans the root for subdirectories containing a `campaign.md` file; each such directory is one campaign. The campaign directory holds markdown files for notes and timeline events, asset images, and a few JSON sidecar files.

## Directory structure

```
<root>/
  my-campaign/                    # campaign folder (name is slugified from campaign title)
    campaign.md                   # config — must exist for the folder to be recognised
    notes/                        # note markdown files, may be arbitrarily nested
      player characters/
        aria.md
      factions/
        iron-circle.md
      locations/
      npcs/
      plots/
      map.png                     # asset files live alongside notes
    timeline/                     # event markdown files (flat — no subdirectories scanned)
      0001-01-15-battle-of-dawn.md
      state.json                  # { in_game_now_seconds, campaign_start_seconds } — epoch-seconds
    sessions.json                 # session records (top-level, optional)
    settings.json                 # campaign settings: { calendar, version, ... } (optional)
    tags.json                     # tag registry { [tagName]: { color, description } } (optional)
    relationships/                # created on campaign init, not yet used by the app
```

The app creates `notes/player characters`, `notes/factions`, `notes/locations`, `notes/npcs`, and `notes/plots` on first open if they do not exist.

## IDs

Every note, event and future referencable entity gets a **4-character alphanumeric ID** (chars `a-z0-9`, 36^4 = ~1.7 M combinations). The app generates one automatically when a file is first read and lacks an `id` frontmatter field, then writes it back.

IDs appear in three places:

1. **Frontmatter** — `id: a1b2` in the YAML block of the file.
2. **Wiki links in body text** — `[[a1b2]]` or `[[Display Label|a1b2]]`.
3. **Event tags** — `id:a1b2` (entity tag format, auto-synced from wiki links in the event body).

Filenames do **not** need to embed the ID; the app finds entities by scanning frontmatter. Event filenames are derived from date + title slug and never include the ID.

## `campaign.md`

```yaml
---
id: x7k2          # short ID for the campaign itself
name: My Campaign
description: A short blurb
---

Optional markdown body (shown nowhere in the UI currently).
```

## Note files (`notes/**/*.md`)

```yaml
---
id: a1b2                         # required; auto-generated if absent
title: Aria Lunashadow           # synced from H1; auto-generated if absent
tagLabelOverride: Aria           # optional — label used on event tag chips
linkLabelOverride: Aria L.       # optional — label used in wiki-link previews
---

# Aria Lunashadow

Body markdown. May contain wiki links: [[c3d4]] or [[Iron Circle|c3d4]].
```

- H1 is the source of truth for the display title. When present it overrides `title` in frontmatter; the app writes the updated frontmatter back on load.
- Frontmatter fields beyond `id`, `title`, and the two label overrides are preserved as-is.
- Asset files (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`) inside `notes/` are indexed as type `asset`; they carry no frontmatter.

## Event files (`timeline/*.md`)

```yaml
---
title: Battle of Dawn
epochSeconds: 148975200          # integer seconds since the campaign calendar's epoch (sole in-game date value)
tags:
  - combat                        # custom tags (free strings)
  - id:a1b2                       # entity tags — auto-synced from wiki links in the body
  - sesh:s1                       # session tags — managed by the app, not user-editable
color: "#8b5cf6"                  # optional hex color
status: happened                  # "happened" | "planned" (optional)
id: e5f6                          # auto-generated on create
tagLabelOverride: Battle          # optional, when a file is tagged (id:{file_id} tags) this text overrides the title if present
linkLabelOverride: Dawn Battle    # optional, same as tag overrides, but for wiki links
---
Event body markdown.

Must contain a h1 title as it drives the title field of the file, which in turn dictates the file name, and tag and link labels
Wiki links here drive the `id:XXXX` entity tags automatically.
```

`epochSeconds` is an integer count of seconds since the active calendar's epoch (Golarion epoch = 0000-01-01 midnight). Older files may also carry a legacy `date` string; the app reads it as a fallback but no longer writes it.

Event filenames follow `YYYY-DDD[Thhmmss]-<slug>.md` where `YYYY` is the zero-padded year, `DDD` is the zero-padded day-of-year from the active calendar, and the optional `T` segment encodes non-midnight times without colons. The slug is lowercased, apostrophes stripped, and non-alphanumeric runs replaced with `-`, capped at 60 chars. Example: `4726-124-battle-of-dawn.md`.

## `timeline/state.json`

```json
{ "in_game_now_seconds": 148975200, "campaign_start_seconds": 0 }
```

`in_game_now_seconds` and `campaign_start_seconds` are integer epoch-seconds (same epoch as event `epochSeconds`). Older files may carry the legacy `in_game_now` / `campaign_start` string fields; the app reads them as a fallback.

## `sessions.json`

Top-level array of session records:

```json
[
  {
    "id": "s1",
    "inGameStartSeconds": 0,
    "inGameEndSeconds": 148975200,
    "realStart": "2024-03-01T18:00:00",
    "realEnd": "2024-03-01T22:00:00",
    "color": "#8b5cf6"
  }
]
```

`inGameStartSeconds` / `inGameEndSeconds` are the sole stored in-game values (epoch-seconds). `realStart` / `realEnd` remain ISO strings (real-world time, unchanged). Older files may carry legacy `inGameStart` / `inGameEnd` string fields.

## `settings.json` (campaign-level)

Each campaign folder may contain a `settings.json` sidecar:

```json
{ "calendar": "glrn" }
```

The `calendar` key is a 4-character calendar ID referencing the active calendar for the campaign. Defaults to Golarion (`"glrn"`) when absent. Custom calendar specs are stored workspace-wide in a single calendars.json file at the root workspace folder (shared by all campaigns); system calendars (Golarion, Gregorian) are built in.

## Tags on events

Three tag namespaces co-exist in the `tags` array:

| Prefix | Example | Meaning |
|---|---|---|
| (none) | `combat` | Custom tag — user-editable free strings |
| `id:` | `id:a1b2` | Entity tag — auto-synced from `[[a1b2]]` wiki links in the body |
| `sesh:` | `sesh:s1` | Session tag — managed by the app |

`isEntityTag`, `isSessionTag`, and `isValidCustomTag` in `src/shared/entity-tags.ts` are the canonical classifiers.

## Entity index

On campaign load the main process scans `notes/` (recursively) and `timeline/` to build an in-memory index of `{ id, path, title, type, tagLabelOverride?, linkLabelOverride? }` entries. The path is campaign-relative with forward slashes. Notes also include asset entries (type `asset`, id `''`). The index is the runtime source of truth for wiki-link resolution and entity tag labels.

## Campaign path resolution

The user picks a root directory once via OS dialog; the app stores it in Electron's `userData/config.json` as `rootDir`. On startup it scans `rootDir` for campaign folders and presents the list. The selected campaign's absolute path is held in `src/main/campaign-state.ts` (`getCampaignPath` / `setCampaignPath`).
