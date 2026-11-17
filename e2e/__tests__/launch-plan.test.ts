import { describe, it, expect } from 'vitest';
import { displayCommand, needsBuild, quoteForWindowsShell } from '../launch-plan.js';

describe('displayCommand', () => {
  const command = ['playwright', 'test'];

  it('on Linux without DISPLAY, wraps the command in xvfb-run with a 1920×1080 screen', () => {
    expect(displayCommand({ platform: 'linux', env: {}, command })).toEqual([
      'xvfb-run',
      '-a',
      '--server-args=-screen 0 1920x1080x24',
      'playwright',
      'test',
    ]);
  });

  it("leaves the command alone when DISPLAY is set or the platform isn't Linux", () => {
    expect(displayCommand({ platform: 'linux', env: { DISPLAY: ':0' }, command })).toBeNull();
    expect(displayCommand({ platform: 'win32', env: {}, command })).toBeNull();
    expect(displayCommand({ platform: 'darwin', env: {}, command })).toBeNull();
  });
});

describe('quoteForWindowsShell', () => {
  it('leaves the command name and plain arguments unquoted so Windows batch shims find their own folder', () => {
    expect(quoteForWindowsShell('npm', ['run', 'build'])).toBe('npm run build');
    expect(quoteForWindowsShell('npm', ['install', '-g', '@scope/pkg'])).toBe(
      'npm install -g @scope/pkg',
    );
  });

  it('quotes arguments with spaces and quotes for the Windows shell', () => {
    expect(quoteForWindowsShell('playwright', ['test', '-g', 'sticky header', 'say "hi"'])).toBe(
      'playwright test -g "sticky header" "say \\"hi\\""',
    );
  });

  it('quotes arguments containing cmd.exe metacharacters', () => {
    expect(quoteForWindowsShell('tool', ['a&b', '50%', 'x|y', ''])).toBe(
      'tool "a&b" "50%" "x|y" ""',
    );
  });
});

describe('needsBuild', () => {
  it('rebuilds when dist is missing or any source is newer than the build', () => {
    expect(needsBuild({ newestSourceMtimeMs: 100, builtMtimesMs: [200, null, 200] })).toBe(true);
    expect(needsBuild({ newestSourceMtimeMs: 100, builtMtimesMs: [200, 50, 200] })).toBe(true);
  });

  it('skips the build when dist is newer than every source', () => {
    expect(needsBuild({ newestSourceMtimeMs: 100, builtMtimesMs: [100, 200, 300] })).toBe(false);
  });
});
