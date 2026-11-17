export interface DisplayCommandInput {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  command: string[];
}

/** Wraps the command in a virtual display on Linux without one; null when none is needed. */
export function displayCommand({ platform, env, command }: DisplayCommandInput): string[] | null {
  if (platform !== 'linux' || env.DISPLAY) return null;
  return ['xvfb-run', '-a', '--server-args=-screen 0 1920x1080x24', ...command];
}

const NEEDS_WINDOWS_QUOTING = /[\s"&|<>^%()!;,=]|^$/;

/**
 * One command line for a Windows shell. A part is double-quoted, with embedded quotes escaped,
 * only when it is empty or contains whitespace, a quote or a cmd.exe metacharacter, so such
 * arguments survive the shell. Everything else, the command name included, stays bare: cmd.exe
 * resolves `%~dp0` in a batch file started by a quoted bare name (`"npm"`) to the current
 * directory instead of the batch file's folder, which breaks `npm.cmd`.
 */
export function quoteForWindowsShell(file: string, args: string[]): string {
  return [file, ...args]
    .map((part) => (NEEDS_WINDOWS_QUOTING.test(part) ? `"${part.replaceAll('"', '\\"')}"` : part))
    .join(' ');
}

export interface NeedsBuildInput {
  newestSourceMtimeMs: number;
  /** One entry per built output; null when that output does not exist. */
  builtMtimesMs: (number | null)[];
}

export function needsBuild({ newestSourceMtimeMs, builtMtimesMs }: NeedsBuildInput): boolean {
  return builtMtimesMs.some((mtime) => mtime === null || mtime < newestSourceMtimeMs);
}
