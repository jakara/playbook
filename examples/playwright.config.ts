import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './catalog',
  workers: 1,
  reporter: 'list',
  outputDir: '../test-results',
  expect: { timeout: 1500 },
  use: { channel: 'chrome', headless: true, viewport: { width: 1280, height: 800 } },
});
