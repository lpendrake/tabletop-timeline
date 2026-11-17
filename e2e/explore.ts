import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import type { ExploreContext, ExploreScript } from './explore-context.js';
import { parseExploreOptions } from './explore-options.js';
import { availableFixtures, launchApp, type AppHandle, type Measurement } from './launch.js';

const MEASUREMENTS_FILE = 'measurements.json';

// Safe in a folder name on every platform: 2026-11-17T09-30-00-123.
const timestamp = new Date().toISOString().slice(0, 23).replaceAll(/[:.]/g, '-');
const parsed = parseExploreOptions({
  argv: process.argv.slice(2),
  availableFixtures: availableFixtures(),
  timestamp,
});
if (!parsed.ok) {
  console.error(parsed.error);
  process.exit(2);
}
const { fixture, script, size, outputDir } = parsed.options;

/** Files this run wrote into the output folder. */
const written = new Set<string>();
const measurements: Record<string, Measurement[]> = {};

function readableMessage(error: unknown): string {
  return stripVTControlCharacters(error instanceof Error ? error.message : String(error));
}

function scriptContext(handle: AppHandle): ExploreContext {
  const { close: _close, measure: _measure, ...rest } = handle;
  return {
    ...rest,
    async shot(name) {
      const file = await handle.shot(name);
      written.add(path.basename(file));
      return file;
    },
    async measure(label, selector) {
      if (Object.hasOwn(measurements, label)) {
        throw new Error(`measure label "${label}" was already used in this run; pick a new label`);
      }
      const result = await handle.measure(selector);
      measurements[label] = result;
      return result;
    },
  };
}

async function runScript(handle: AppHandle): Promise<number> {
  const ctx = scriptContext(handle);
  try {
    if (script) {
      const loaded = (await import(pathToFileURL(path.resolve(script)).href)) as {
        default: ExploreScript;
      };
      await loaded.default(ctx);
    } else {
      await ctx.shot('campaigns');
    }
    return 0;
  } catch (error) {
    await ctx.shot('error').catch(() => undefined);
    console.error(`Script failed: ${readableMessage(error)}`);
    return 1;
  } finally {
    await writeFile(
      path.join(handle.outputDir, MEASUREMENTS_FILE),
      JSON.stringify({ fixture, windowSize: handle.size, measurements }, null, 2),
    );
    written.add(MEASUREMENTS_FILE);
  }
}

let exitCode = 0;
let handle: AppHandle | undefined;
try {
  handle = await launchApp({ fixture, outputDir, size });
} catch (error) {
  exitCode = 1;
  console.error(`launch failed: ${readableMessage(error)}`);
}
if (handle) {
  exitCode = await runScript(handle).catch((error: unknown) => {
    console.error(`Script failed: ${readableMessage(error)}`);
    return 1;
  });
  try {
    await handle.close();
  } catch (error) {
    exitCode = 1;
    console.error(`close failed: ${readableMessage(error)}`);
  }
}

console.log(`Output folder: ${handle?.outputDir ?? outputDir}`);
for (const file of written) console.log(`  ${file}`);
process.exit(exitCode);
