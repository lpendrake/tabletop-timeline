import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e/specs',
  testMatch: '**/*.spec.ts',
  outputDir: 'e2e/output/test-results',
  globalSetup: './e2e/global-setup.ts',
  workers: 1,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
});
