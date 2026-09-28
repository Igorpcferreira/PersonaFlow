import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e', workers: 1, fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  timeout: 45_000, expect: { timeout: 15_000 },
  use: { baseURL: process.env.E2E_BASE_URL, browserName: 'chromium', screenshot: 'only-on-failure' },
  reporter: 'list',
});
