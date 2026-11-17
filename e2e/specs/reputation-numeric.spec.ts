import { test, expect, type TestInfo } from '@playwright/test';
import { launchApp, type AppHandle, type Measurement } from '../launch.js';
import { allLabel } from '../../src/renderer/relationships/domain/holders.js';
import { TOOLTIP_MAX_WIDTH } from '../../src/renderer/relationships/domain/numeric-rows.js';
import { VIEWPORT_MARGIN } from '../../src/renderer/shared/tooltip-position.js';

const TOLERANCE = 1;
const TOOLTIP = 'body > .rel-num-tooltip';
// A pointer closer than this to the right edge cannot fit a full-width tooltip, so it right-anchors.
const TOOLTIP_REACH = TOOLTIP_MAX_WIDTH + VIEWPORT_MARGIN;
const TRACK_TAB = 'PF2E Reputation';
const PICKER_BUTTON = '.rel-holder-button[aria-haspopup=listbox]';

let handle: AppHandle;

test.beforeAll(async () => {
  handle = await launchApp({
    fixture: 'reputation',
    outputDir: 'e2e/output/reputation-numeric',
  });
  await handle.openCampaign('Reputation Fixture');
  await handle.goToView('relationships');
  const { page } = handle;
  const tab = page.getByRole('tab', { name: new RegExp(`^${TRACK_TAB}`) });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await page.locator(PICKER_BUTTON).click();
  await page
    .locator('.rel-holder-dropdown [role=option]')
    .filter({ hasText: allLabel('numeric') })
    .click();
  await expect(page.locator('.rel-holder-dropdown')).toHaveCount(0);
  await expect(page.locator('.rel-group-header').first()).toBeVisible();
});

test.afterAll(async () => {
  await handle?.close();
});

test.beforeEach(async () => {
  await handle.page.evaluate(() => {
    document.querySelector('.rel-view')!.scrollTop = 0;
  });
  await handle.page.mouse.move(1, 1);
  await expect(handle.page.locator(TOOLTIP)).toHaveCount(0);
});

test.afterEach(async ({}, testInfo: TestInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const slug = testInfo.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  try {
    await handle.shot(`failed-${slug}`);
  } catch (error) {
    console.warn(`Could not take the failure screenshot for "${testInfo.title}":`, error);
  }
});

async function scrollViewTo(top: number): Promise<number> {
  await handle.page.evaluate((y) => {
    document.querySelector('.rel-view')!.scrollTop = y;
  }, top);
  const [view] = await handle.measure('.rel-view');
  return view.scroll.scrollTop;
}

function expectClose(actual: number, expected: number, what: string): void {
  expect(Math.abs(actual - expected), `${what}: ${actual} vs ${expected}`).toBeLessThanOrEqual(
    TOLERANCE,
  );
}

/** One measurement per row for a cell selector, in row order. */
async function rowCells(cell: string): Promise<Measurement[]> {
  const rows = await handle.measure('.rel-num-row');
  const cells = await handle.measure(`.rel-num-row ${cell}`);
  expect(cells).toHaveLength(rows.length);
  return cells;
}

/**
 * Scrolls a plot dot to the middle of the view, clear of the sticky header, and moves the
 * pointer onto its centre: the first dot, or the one furthest right.
 */
async function hoverDot(pick: 'first' | 'rightmost'): Promise<{ x: number; y: number }> {
  const point = await handle.page.evaluate((which) => {
    const view = document.querySelector('.rel-view')!;
    const dots = [...document.querySelectorAll('.rel-num-row .rel-num-dot')];
    const dot =
      which === 'rightmost'
        ? dots.reduce((best, d) =>
            d.getBoundingClientRect().x > best.getBoundingClientRect().x ? d : best,
          )
        : dots[0];
    dot.scrollIntoView({ block: 'center' });
    view.scrollTop -= document.querySelector('.rel-num-header')!.getBoundingClientRect().height;
    const r = dot.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }, pick);
  await handle.page.mouse.move(point.x, point.y);
  return point;
}

async function leavePlot(): Promise<void> {
  await handle.page.mouse.move(1, 1);
  await expect(handle.page.locator(TOOLTIP)).toHaveCount(0);
}

test('sticky header stays pinned to the top of the view with no rows above it after scrolling', async () => {
  const scrollTop = await scrollViewTo(300);
  expect(scrollTop).toBeGreaterThan(0);
  const [view] = await handle.measure('.rel-view');
  const [header] = await handle.measure('.rel-num-header');
  expectClose(header.box.y, view.box.y, 'header top vs view top');
  const hit = await handle.page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return { inHeader: !!el?.closest('.rel-num-header'), inRow: !!el?.closest('.rel-num-row') };
    },
    { x: header.box.x + header.box.width / 2, y: header.box.y + 1 },
  );
  expect(hit).toEqual({ inHeader: true, inRow: false });
  // The hit test only means something if a scrolled row really sits under the header.
  const rows = await handle.measure('.rel-num-row');
  const underHeader = rows.some(
    (r) => r.box.y < header.box.y + header.box.height && r.box.y + r.box.height > header.box.y,
  );
  expect(underHeader, 'a row overlaps the header band').toBe(true);
  await handle.shot('header-scrolled');
});

test('header column titles line up with the row cells under them', async () => {
  const columns: [string, string][] = [
    ['.rel-num-th.is-entries', '.rel-num-toggle'],
    ['.rel-num-th.is-last', '.rel-num-last'],
    ['.rel-num-th.is-name', '.rel-num-name'],
    ['.rel-num-th.is-band', '.rel-num-band-label'],
    ['.rel-num-th.is-value', '.rel-num-value'],
  ];
  for (const [title, cell] of columns) {
    const [th] = await handle.measure(title);
    for (const [i, c] of (await rowCells(cell)).entries()) {
      expectClose(c.box.x, th.box.x, `${cell} of row ${i} vs ${title}`);
    }
  }
  const [axis] = await handle.measure('.rel-num-axis');
  const plots = await handle.measure('.rel-num-row > .rel-num-plot');
  expect(plots.length).toBeGreaterThan(0);
  for (const [i, plot] of plots.entries()) {
    expectClose(plot.box.x, axis.box.x, `plot ${i} left vs axis`);
    expectClose(plot.box.width, axis.box.width, `plot ${i} width vs axis`);
  }
});

test('band labels sit over their band spans', async () => {
  const labels = await handle.measure('.rel-num-axis-band');
  const rows = await handle.page.evaluate(() =>
    [...document.querySelectorAll('.rel-num-row > .rel-num-plot')].map((plot) =>
      [...plot.querySelectorAll('.rel-num-band')].map((band) => {
        const r = band.getBoundingClientRect();
        return { x: r.x, width: r.width };
      }),
    ),
  );
  expect(rows.length).toBeGreaterThan(0);
  for (const [r, bands] of rows.entries()) {
    expect(bands).toHaveLength(labels.length);
    for (const [i, label] of labels.entries()) {
      expectClose(bands[i].x, label.box.x, `row ${r} band ${i} left`);
      expectClose(bands[i].width, label.box.width, `row ${r} band ${i} width`);
    }
  }
});

test('plot tooltip opens above the pointer', async () => {
  try {
    const pointer = await hoverDot('first');
    const [tooltip] = await handle.measure(TOOLTIP);
    expect(tooltip.box.y + tooltip.box.height).toBeLessThanOrEqual(pointer.y + TOLERANCE);
    await handle.shot('tooltip-above-pointer');
  } finally {
    await leavePlot();
  }
});

test("plot tooltip uses the app font, not the browser's default serif", async () => {
  try {
    await hoverDot('first');
    const [tooltip] = await handle.measure(TOOLTIP);
    const appFont = await handle.page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.fontFamily = 'var(--app-font)';
      document.body.append(probe);
      const resolved = getComputedStyle(probe).fontFamily;
      probe.remove();
      return resolved;
    });
    expect(appFont).toMatch(/\S/);
    expect(tooltip.style.fontFamily).toBe(appFont);
    expect(tooltip.style.fontFamily).not.toMatch(/^"?(serif|times)/i);
  } finally {
    await leavePlot();
  }
});

test('plot tooltip stays inside the window and beside the pointer at the right edge', async () => {
  try {
    const pointer = await hoverDot('rightmost');
    const { width } = handle.size;
    expect(pointer.x).toBeGreaterThan(width - TOOLTIP_REACH);
    const [tooltip] = await handle.measure(TOOLTIP);
    expect(tooltip.box.x).toBeGreaterThanOrEqual(-TOLERANCE);
    expect(tooltip.box.x + tooltip.box.width).toBeLessThanOrEqual(width + TOLERANCE);
    expect(Math.abs(tooltip.box.x + tooltip.box.width - pointer.x)).toBeLessThanOrEqual(2);
    await handle.shot('tooltip-right-edge');
  } finally {
    await leavePlot();
  }
});

test('holder picker list draws above the rows', async () => {
  await scrollViewTo(0);
  const { page } = handle;
  await page.locator(PICKER_BUTTON).click();
  try {
    const options = await handle.measure('.rel-holder-dropdown [role=option]');
    const [list] = await handle.measure('.rel-holder-dropdown .searchable-picker-list');
    const shown = options.filter(
      (o) => o.box.y >= list.box.y && o.box.y + o.box.height <= list.box.y + list.box.height,
    );
    expect(shown.length).toBeGreaterThan(1);
    // The search field and the dropdown's top edge reach up beside the sticky header.
    const [dropdown] = await handle.measure('.rel-holder-dropdown');
    const [search] = await handle.measure('.rel-holder-dropdown input');
    const probes = [
      ...shown.map((o) => ({ what: `option ${o.text}`, box: o.box })),
      { what: 'search field', box: search.box },
      { what: 'dropdown top edge', box: { ...dropdown.box, height: 4 } },
    ];
    for (const { what, box } of probes) {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const inDropdown = await page.evaluate(
        ([px, py]) => !!document.elementFromPoint(px, py)?.closest('.rel-holder-dropdown'),
        [x, y],
      );
      expect(inDropdown, `${what} is covered`).toBe(true);
    }
    await handle.shot('holder-picker-open');
  } finally {
    await page.keyboard.press('Escape');
    await expect(page.locator('.rel-holder-dropdown')).toHaveCount(0);
  }
});
