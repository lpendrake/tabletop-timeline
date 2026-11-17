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

/**
 * One command line for a Windows shell: every part is double-quoted, with embedded quotes
 * escaped, so arguments containing spaces or quotes survive the shell.
 */
export function quoteForWindowsShell(file: string, args: string[]): string {
  return [file, ...args].map((part) => `"${part.replaceAll('"', '\\"')}"`).join(' ');
}

export interface NeedsBuildInput {
  newestSourceMtimeMs: number;
  /** One entry per built output; null when that output does not exist. */
  builtMtimesMs: (number | null)[];
}

export function needsBuild({ newestSourceMtimeMs, builtMtimesMs }: NeedsBuildInput): boolean {
  return builtMtimesMs.some((mtime) => mtime === null || mtime < newestSourceMtimeMs);
}
