import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { launchApp, type AppHandle } from '../launch.js';

let handle: AppHandle;

test.beforeAll(async () => {
  handle = await launchApp({ fixture: 'reputation', outputDir: 'e2e/output/launch' });
  await handle.openCampaign('Reputation Fixture');
  await handle.goToView('relationships');
});

test.afterAll(async () => {
  await handle?.close();
});

test('launches on a temp copy of the reputation fixture and opens it', async () => {
  await expect(handle.page.locator('.rel-view')).toBeVisible();
  const workspace = await handle.app.evaluate(({ app }) => app.getPath('userData'));
  const repoFixtures = path.resolve('e2e', 'fixtures');
  expect(path.resolve(workspace).startsWith(repoFixtures)).toBe(false);
  const config = JSON.parse(readFileSync(path.join(workspace, 'config.json'), 'utf8')) as {
    rootDir: string;
  };
  expect(path.resolve(config.rootDir).startsWith(repoFixtures)).toBe(false);
  expect(existsSync(path.join(config.rootDir, 'reputation'))).toBe(true);
});

test('the window content has the requested size', async () => {
  const size = await handle.page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  expect(size).toEqual({ width: 1000, height: 700 });
  expect(handle.size).toEqual(size);
});

test('measure returns box, text, computed font and scroll sizes for every match', async () => {
  const measurements = await handle.measure('.rel-view');
  expect(measurements).toHaveLength(1);
  const [m] = measurements;
  expect(m.box.width).toBeGreaterThan(0);
  expect(m.box.height).toBeGreaterThan(0);
  expect(m.text.length).toBeGreaterThan(0);
  expect(m.scroll.clientWidth).toBeGreaterThan(0);
  expect(m.scroll.scrollTop).toBe(0);
  expect(m.scroll.scrollLeft).toBe(0);
  expect(m.style.fontSize).toMatch(/px$/);
  expect(m.style.fontFamily).not.toBe('');
  expect(m.style.position).not.toBe('');
});

test('shot writes a PNG into the output folder', async () => {
  const file = await handle.shot('shot-check');
  expect(file).toBe(path.join(handle.outputDir, 'shot-check.png'));
  expect(existsSync(file)).toBe(true);
  expect(readFileSync(file).subarray(1, 4).toString('latin1')).toBe('PNG');
});
