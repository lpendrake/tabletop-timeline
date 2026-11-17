import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  environmentChecks,
  evaluateDoctor,
  hasFailure,
  type DoctorProbes,
  type TrialLaunch,
} from './doctor-checks.js';
import { killCommand, spawnCommand, spawnCommandSync } from './spawn-command.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ELECTRON_DIR = path.join(REPO_ROOT, 'node_modules', 'electron');
const TRIAL_OUT = path.join('e2e', 'output', 'doctor');
const TRIAL_ARGS = ['run', 'app:explore', '--', '--fixture', 'reputation', '--out', TRIAL_OUT];
// The first run may have to build the app.
const TRIAL_TIMEOUT_MS = 10 * 60_000;

function electronBinary(): string | null {
  const pathFile = path.join(ELECTRON_DIR, 'path.txt');
  if (!existsSync(pathFile)) return null;
  const binary = path.join(ELECTRON_DIR, 'dist', readFileSync(pathFile, 'utf8').trim());
  return existsSync(binary) ? binary : null;
}

function missingLibraries(binary: string): string[] | null {
  const ldd = spawnCommandSync('ldd', [binary], { encoding: 'utf8' });
  if (ldd.error || ldd.status === null) return null;
  return String(ldd.stdout)
    .split('\n')
    .filter((line) => line.includes('not found'))
    .map((line) => line.trim().split(' ')[0]);
}

function onPath(command: string): boolean {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  return spawnCommandSync(finder, [command], { stdio: 'ignore' }).status === 0;
}

function probe(): DoctorProbes {
  const linux = process.platform === 'linux';
  const binary = electronBinary();
  return {
    platform: process.platform,
    nodeModulesInstalled: existsSync(path.join(REPO_ROOT, 'node_modules')),
    electronBinaryInstalled: binary !== null,
    missingLibraries: linux && binary ? missingLibraries(binary) : [],
    displaySet: Boolean(process.env.DISPLAY),
    xvfbRunOnPath: linux && onPath('xvfb-run'),
    isRoot: process.getuid?.() === 0,
  };
}

/** Runs the real explore command, streaming its output, and kills its whole process group on timeout. */
function runTrialCommand(): Promise<{ code: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawnCommand('npm', TRIAL_ARGS, { cwd: REPO_ROOT, stdio: 'inherit' });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killCommand(child, 'SIGKILL');
    }, TRIAL_TIMEOUT_MS);
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.once(signal, () => {
        killCommand(child, signal);
        process.exit(1);
      });
    }
    const finish = (code: number | null) => {
      clearTimeout(timer);
      resolve({ code, timedOut });
    };
    child.on('error', (error) => {
      console.error(`could not start npm: ${error.message}`);
      finish(null);
    });
    child.on('exit', finish);
  });
}

async function trialLaunch(): Promise<TrialLaunch> {
  console.log(
    `Trial launch: npm run app:explore -- --fixture reputation --out ${TRIAL_OUT} (the first run may build the app)…`,
  );
  // A stale screenshot from an earlier run must not count.
  rmSync(path.join(REPO_ROOT, TRIAL_OUT), { recursive: true, force: true });
  const { code, timedOut } = await runTrialCommand();
  if (timedOut) {
    return { ok: false, detail: `timed out after ${TRIAL_TIMEOUT_MS / 60_000} minutes` };
  }
  if (code !== 0) return { ok: false, detail: `exited with code ${code} — see the output above` };
  if (!existsSync(path.join(REPO_ROOT, TRIAL_OUT, 'campaigns.png'))) {
    return { ok: false, detail: 'exited cleanly but wrote no screenshot — see the output above' };
  }
  return { ok: true };
}

const SYMBOLS = { pass: '✔', fail: '✘', skip: '–' } as const;
const probes = probe();
const trial = hasFailure(environmentChecks(probes)) ? undefined : await trialLaunch();
const report = evaluateDoctor(probes, trial);
for (const check of report.checks) {
  console.log(`${SYMBOLS[check.status]} ${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
  if (check.fix) console.log(`    fix: ${check.fix}`);
}
console.log(report.ready ? 'ready' : 'not ready');
process.exit(report.ready ? 0 : 1);
