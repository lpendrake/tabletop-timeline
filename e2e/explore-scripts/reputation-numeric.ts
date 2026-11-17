import type { ExploreScript } from '../explore-context.js';

// Template for agents. Run with:
//   npm run app:explore -- --fixture reputation --script e2e/explore-scripts/reputation-numeric.ts
// A script receives the launched app (`page` is a Playwright Page) and helpers: openCampaign,
// goToView, shot(name) -> <out>/<name>.png, and measure(label, selector), which records the
// result under `label` in measurements.json.
const script: ExploreScript = async ({ page, openCampaign, goToView, shot, measure }) => {
  await openCampaign('Reputation Fixture');
  await goToView('relationships');
  await shot('numeric-tab');
  await measure('header', '.rel-num-header');

  // Hover the dot nearest the right edge (The Party -> Sister Odessa, +35) to check that the
  // tooltip stays inside the window.
  await page
    .locator('.rel-num-row', { hasText: 'Sister Odessa' })
    .first()
    .locator('.rel-num-dot-hit')
    .hover();
  await shot('tooltip-right-edge');
  await measure('tooltip', 'body > .rel-num-tooltip');
};

export default script;
