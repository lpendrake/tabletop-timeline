import { displayCommand } from './launch-plan.js';
import { killCommand, spawnCommand } from './spawn-command.js';

const command = process.argv.slice(2);
if (command.length === 0) {
  console.error('usage: tsx e2e/with-display.ts <command...>');
  process.exit(2);
}

const wrapped = displayCommand({ platform: process.platform, env: process.env, command });
const [file, ...args] = wrapped ?? command;
// On POSIX the child leads its own process group so a signal can stop xvfb-run, Xvfb,
// Playwright and Electron together; on Windows Ctrl+C already reaches every process on the
// console.
const child = spawnCommand(file, args, { stdio: 'inherit' });

if (process.platform !== 'win32') {
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => killCommand(child, signal));
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
