import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';

// These suites transitively `import ... from 'electron'` (via timelineIpcHandlers),
// which throws at module-load time unless a real Electron binary is installed. Some
// sandboxed environments can't download that binary (the GitHub release asset fetch
// is blocked), so we skip just these two suites there. They still run wherever
// Electron is installed — path.txt exists only after a successful binary install —
// so normal CI keeps full coverage.
const electronInstalled = existsSync(
  fileURLToPath(new URL('./node_modules/electron/path.txt', import.meta.url)),
);
const electronOnlyTests = [
  'src/main/__tests__/timeline-create-event.test.ts',
  'src/main/__tests__/timeline-update-event.test.ts',
];

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Ensures relative paths when built for Electron
  test: {
    exclude: [
      ...configDefaults.exclude,
      // Build output — never run tests from compiled artifacts (vitest v4 no longer
      // excludes dist by default, and `npm run build` emits test copies there).
      'dist/**',
      '.claude/worktrees/**',
      ...(electronInstalled ? [] : electronOnlyTests),
    ],
  },
});
