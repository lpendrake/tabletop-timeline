import {
  spawn,
  spawnSync,
  type ChildProcess,
  type SpawnOptions,
  type SpawnSyncOptions,
  type SpawnSyncReturns,
} from 'node:child_process';
import { quoteForWindowsShell } from './launch-plan.js';

const isWindows = process.platform === 'win32';

/**
 * Starts `file args...`. On Windows tools such as `npm` and `playwright` are .cmd shims, which
 * Node refuses to spawn without a shell, and a shell joins arguments unquoted, so the whole
 * command line is quoted into one string. Elsewhere no shell is used and arguments pass through
 * untouched, and the child leads its own process group so `killCommand` can stop everything it
 * started.
 */
export function spawnCommand(
  file: string,
  args: string[],
  options: SpawnOptions = {},
): ChildProcess {
  return isWindows
    ? spawn(quoteForWindowsShell(file, args), { ...options, shell: true })
    : spawn(file, args, { ...options, detached: true });
}

/** Synchronous counterpart of `spawnCommand`, with the same Windows quoting and no process group. */
export function spawnCommandSync(
  file: string,
  args: string[],
  options: SpawnSyncOptions = {},
): SpawnSyncReturns<Buffer> {
  return isWindows
    ? spawnSync(quoteForWindowsShell(file, args), { ...options, shell: true })
    : spawnSync(file, args, options);
}

/** Signals the child and everything it started: its process group on POSIX, its tree on Windows. */
export function killCommand(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  if (isWindows) {
    spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, signal);
    } catch {
      // The group already exited.
    }
  }
}
