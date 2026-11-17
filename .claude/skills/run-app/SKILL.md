---
name: run-app
description: Use this repo skill (instead of the generic built-in run skill) whenever you need to launch, run, drive, screenshot or measure the real TableTop Timeline Electron app, or verify a UI, CSS, layout, positioning, font, portal or z-order change in the real app. Covers e2e:doctor, e2e specs, app:explore scripts and fixtures.
---

# Run the Real App

Unit tests (vitest + happy-dom) cannot see CSS or layout. Specs assert **measurements**,
never pixel diffs.

## Commands

- `npm run e2e:doctor` — run first. Ready = no check failed (Linux-only checks are skipped
  on Windows/macOS), including a trial launch. A failing check prints the exact fix.
- `npm run e2e` — all specs in `e2e/specs/`. One spec: `npm run e2e -- -g "<title>"`.
- `npm run app:explore -- --fixture <name> [--script <file.ts>] [--size WxH] [--out <dir>]`
  — launch on a fixture, run the script (default: one screenshot of the campaign list),
  write to `e2e/output/explore/<fixture>-<timestamp>/` (gitignored) unless `--out` is given.
  Run from the repo root (the script path resolves from the current directory).

## Explore script

Template: `e2e/explore-scripts/reputation-numeric.ts`.

```ts
import type { ExploreScript } from '../explore-context.js';

const script: ExploreScript = async ({ page, openCampaign, goToView, shot, measure }) => {
  await openCampaign('Reputation Fixture'); // campaign.md `name`
  await goToView('notes'); // 'timeline' | 'notes' | 'relationships'
  await page.locator('.some-row').hover(); // `page`: Playwright Page
  await shot('hovered'); // <out>/hovered.png
  await measure('row', '.some-row'); // label unique per run
};
export default script;
```

The context also has `app`, `size`, `outputDir`.

## Reading results

- Open the PNGs with the Read tool. `measurements.json`:
  `{ fixture, windowSize, measurements: { [label]: Measurement[] } }`; a `Measurement` has
  `box {x,y,width,height}`, `text`, `scroll {scrollWidth, clientWidth, scrollHeight,
  clientHeight, scrollTop, scrollLeft}`, `style {fontFamily, fontSize, position, zIndex,
  opacity, overflowX, overflowY}`. Truncation: `scrollWidth > clientWidth`.
- If the script throws, explore saves `error.png`, still writes `measurements.json`, prints
  `Script failed: …` and exits 1.

## Writing a spec

Copy `e2e/specs/reputation-numeric.spec.ts`: one `launchApp` per file in `beforeAll`, window
size from `handle.size`, ±1 px tolerance, `expect(locator).toHaveCount(0)` for absence, and
the failure-screenshot `afterEach`.

## Adding a fixture

Any folder under `e2e/fixtures/` other than `__tests__` is a fixture: a plain campaign,
readable without the app (format in root `AGENTS.md`).

- `campaign.md` with `id` and `name`; ids are 4 chars `[a-z0-9]`.
- `settings.json` `version` = `LATEST_VERSION` in `src/main/migration/registry.ts`.
- Every note and event has `id`, `title` and a matching H1, so opening rewrites nothing.
  Event files are `<year>-<day-of-year>-<slug>.md` matching `epochSeconds` (see
  `buildNewFilename` in `src/main/migration/migrations/0003-rename-event-files.ts`).
- `timeline/state.json` with `in_game_now_seconds`; a vitest guard like
  `e2e/fixtures/__tests__/reputation-fixture.test.ts`.

## Gotchas

- Under xvfb the window opens at 800×600; the harness sets the content size (default
  1000×700; `--size` to change). `openCampaign` dismisses the "Campaign loaded" notice.
- F1/F2/F3 switch to Timeline/Notes/Relationships (`goToView` presses them; `VIEW_SHORTCUT_KEYS`).
- Text widths differ between Linux and Windows fonts; compare elements to each other, never
  absolute text widths.
- Never run `playwright install`; Electron needs no browsers. Electron downloads its binary
  lazily on first run: `node node_modules/electron/install.js` (doctor prints this).
- `TT_RENDERER=dist` makes the unpackaged app load `dist/` (harness sets it). CI's `e2e`
  job uploads `e2e/output/` as the `e2e-screenshots` artifact.
- Linux prerequisites: `scripts/setup-linux-e2e.sh` (run by the SessionStart hook in cloud sessions).
