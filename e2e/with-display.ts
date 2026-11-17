import { spawn } from 'node:child_process';
import { displayCommand, quoteForWindowsShell } from './launch-plan.js';

const command = process.argv.slice(2);
if (command.length === 0) {
  console.error('usage: tsx e2e/with-display.ts <command...>');
  process.exit(2);
}

const wrapped = displayCommand({ platform: process.platform, env: process.env, command });
const [file, ...args] = wrapped ?? command;
const isWindows = process.platform === 'win32';

// On Windows `playwright` is a .cmd shim, which Node refuses to spawn without a shell, and a
// shell joins arguments unquoted, so the whole command line is quoted into one string.
// Elsewhere no shell is used and arguments pass through untouched. On POSIX the child leads
// its own process group so a signal can stop xvfb-run, Xvfb, Playwright and Electron together;
// on Windows Ctrl+C already reaches every process on the console.
const child = isWindows
  ? spawn(quoteForWindowsShell(file, args), { stdio: 'inherit', shell: true })
  : spawn(file, args, { stdio: 'inherit', detached: true });

if (!isWindows) {
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      if (child.pid !== undefined) process.kill(-child.pid, signal);
    });
  }
}
child.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'ENOENT' && file === 'xvfb-run') {
    console.error('xvfb-run not found — run scripts/setup-linux-e2e.sh');
  } else {
    console.error(`could not start ${file}: ${error.message}`);
  }
  process.exit(1);
});
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
