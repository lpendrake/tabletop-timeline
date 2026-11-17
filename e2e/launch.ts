import { _electron, type ElectronApplication, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RENDERER_ENV_DIST, RENDERER_ENV_VAR } from '../src/main/renderer-source.js';
import { VIEW_SHORTCUT_KEYS } from '../src/renderer/relationships/domain/view-shortcut.js';
import type { ViewType } from '../src/renderer/components/footer.js';
import { needsBuild } from './launch-plan.js';

export interface Measurement {
  box: { x: number; y: number; width: number; height: number };
  text: string;
  scroll: {
    scrollWidth: number;
    clientWidth: number;
    scrollHeight: number;
    clientHeight: number;
    scrollTop: number;
    scrollLeft: number;
  };
  style: {
    fontFamily: string;
    fontSize: string;
    position: string;
    zIndex: string;
    opacity: string;
    overflowX: string;
    overflowY: string;
  };
}

export interface LaunchOptions {
  /** Folder name under e2e/fixtures/. */
  fixture: string;
  /** Where `shot` writes screenshots; relative paths resolve against the repo root. */
  outputDir: string;
  /** Content size of the window; defaults to 1000×700. */
  size?: { width: number; height: number };
}

export type AppView = ViewType;

export interface AppHandle {
  app: ElectronApplication;
  page: Page;
  /** Absolute folder `shot` writes into. */
  outputDir: string;
  /** The content size applied to the window (`page.viewportSize()` is null under Electron). */
  size: { width: number; height: number };
  openCampaign(name: string): Promise<void>;
  goToView(view: AppView): Promise<void>;
  shot(name: string): Promise<string>;
  /**
   * Waits for at least one match to be attached, then reports every match. To assert that
   * nothing matches, use `expect(locator).toHaveCount(0)` instead.
   */
  measure(selector: string): Promise<Measurement[]>;
  close(): Promise<void>;
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES_DIR = path.join(REPO_ROOT, 'e2e', 'fixtures');
const DEFAULT_SIZE = { width: 1000, height: 700 };

const BUILT_OUTPUTS = ['dist/index.html', 'dist/main/index.js', 'dist/preload/index.cjs'];
const SOURCE_ROOTS = ['src', 'index.html', 'vite.config.ts', 'tsconfig.main.json', 'package.json'];

// A selector that exists once each view has rendered.
const VIEW_SELECTORS: Record<AppView, string> = {
  timeline: '[data-timeline-viewport]',
  notes: '.notes-shell',
  relationships: '.rel-view',
};

const SIZE_TIMEOUT_MS = 5_000;

function newestMtimeMs(target: string): number {
  const stats = statSync(target);
  if (!stats.isDirectory()) return stats.mtimeMs;
  return readdirSync(target).reduce(
    (newest, entry) => Math.max(newest, newestMtimeMs(path.join(target, entry))),
    stats.mtimeMs,
  );
}

/** Runs `npm run build` unless dist is newer than every source. */
export function buildIfStale(): void {
  const newestSourceMtimeMs = Math.max(
    ...SOURCE_ROOTS.map((p) => newestMtimeMs(path.join(REPO_ROOT, p))),
  );
  const builtMtimesMs = BUILT_OUTPUTS.map((p) => {
    const full = path.join(REPO_ROOT, p);
    return existsSync(full) ? statSync(full).mtimeMs : null;
  });
  if (!needsBuild({ newestSourceMtimeMs, builtMtimesMs })) return;

  console.log('e2e: dist is missing or stale, running npm run build');
  const result = spawnSync('npm run build', { cwd: REPO_ROOT, stdio: 'inherit', shell: true });
  if (result.status !== 0) throw new Error('npm run build failed');
}

function availableFixtures(): string[] {
  return readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '__tests__')
    .map((entry) => entry.name);
}

export async function launchApp(options: LaunchOptions): Promise<AppHandle> {
  const fixtures = availableFixtures();
  if (!fixtures.includes(options.fixture)) {
    throw new Error(
      `Unknown fixture "${options.fixture}". Available fixtures: ${fixtures.join(', ')}`,
    );
  }
  buildIfStale();

  const tempDir = mkdtempSync(path.join(tmpdir(), 'tt-e2e-'));
  const size = options.size ?? DEFAULT_SIZE;
  const outputDir = path.resolve(REPO_ROOT, options.outputDir);

  let app: ElectronApplication | undefined;
  try {
    const workspaceDir = path.join(tempDir, 'workspace');
    const userDataDir = path.join(tempDir, 'user-data');
    cpSync(path.join(FIXTURES_DIR, options.fixture), path.join(workspaceDir, options.fixture), {
      recursive: true,
    });
    mkdirSync(userDataDir, { recursive: true });
    await writeFile(
      path.join(userDataDir, 'config.json'),
      JSON.stringify({ rootDir: workspaceDir }),
    );

    // Hosts such as VS Code leak ELECTRON_RUN_AS_NODE, which makes Electron start as plain Node.
    const { ELECTRON_RUN_AS_NODE: _leaked, ...inheritedEnv } = process.env;
    // Playwright supplies --no-sandbox on Linux.
    app = await _electron.launch({
      args: [REPO_ROOT, `--user-data-dir=${userDataDir}`],
      cwd: REPO_ROOT,
      env: { ...inheritedEnv, [RENDERER_ENV_VAR]: RENDERER_ENV_DIST } as Record<string, string>,
    });
    const page = await app.firstWindow();
    await applyContentSize(app, page, size);

    const openApp = app;
    return {
      app: openApp,
      page,
      outputDir,
      size,
      async openCampaign(name) {
        await page.getByRole('heading', { level: 2, name, exact: true }).click();
        const notice = page.locator('.campaign-load-box');
        const body = notice.locator('.campaign-load-notification-body');
        await body.waitFor();
        const text = ((await body.textContent()) ?? '').replace(/×$/, '').trim();
        if (!text.startsWith('Campaign loaded')) {
          throw new Error(`Opening "${name}" failed: ${text}`);
        }
        // The notice dismisses itself after 5 s, so the button may already be gone.
        await notice
          .locator('button[aria-label="Dismiss"]')
          .click({ timeout: 1_000 })
          .catch(() => undefined);
        await notice.waitFor({ state: 'detached' });
      },
      async goToView(view) {
        await page.keyboard.press(VIEW_SHORTCUT_KEYS[view]);
        await page.locator(VIEW_SELECTORS[view]).first().waitFor();
      },
      async shot(name) {
        const file = path.join(outputDir, `${name}.png`);
        mkdirSync(path.dirname(file), { recursive: true });
        await page.screenshot({ path: file });
        return file;
      },
      async measure(selector) {
        const matches = page.locator(selector);
        await matches.first().waitFor({ state: 'attached' });
        return matches.evaluateAll((elements) =>
          elements.map((el) => {
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return {
              box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              text: el.textContent ?? '',
              scroll: {
                scrollWidth: el.scrollWidth,
                clientWidth: el.clientWidth,
                scrollHeight: el.scrollHeight,
                clientHeight: el.clientHeight,
                scrollTop: el.scrollTop,
                scrollLeft: el.scrollLeft,
              },
              style: {
                fontFamily: style.fontFamily,
                fontSize: style.fontSize,
                position: style.position,
                zIndex: style.zIndex,
                opacity: style.opacity,
                overflowX: style.overflowX,
                overflowY: style.overflowY,
              },
            };
          }),
        );
      },
      async close() {
        try {
          await openApp.close();
        } finally {
          await removeTempDir(tempDir);
        }
      },
    };
  } catch (error) {
    await app?.close().catch(() => undefined);
    await removeTempDir(tempDir);
    throw error;
  }
}

async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true, maxRetries: 10 }).catch(() => undefined);
}

async function applyContentSize(
  app: ElectronApplication,
  page: Page,
  size: { width: number; height: number },
): Promise<void> {
  const workArea = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  const win = await app.browserWindow(page);
  await win.evaluate(
    (w, target) => {
      w.unmaximize();
      w.setPosition(target.x, target.y);
      w.setContentSize(target.width, target.height);
    },
    { x: workArea.x, y: workArea.y, ...size },
  );
  try {
    await page.waitForFunction(
      (s) => window.innerWidth === s.width && window.innerHeight === s.height,
      size,
      { timeout: SIZE_TIMEOUT_MS },
    );
  } catch {
    const actual = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    throw new Error(
      `Window content size ${actual.width}×${actual.height} never reached the requested ` +
        `${size.width}×${size.height}; the primary display work area is ` +
        `${workArea.width}×${workArea.height}`,
    );
  }
}
