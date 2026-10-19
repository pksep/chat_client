import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  testMatch: [
    'manager-reuse.spec.ts',
    'manager-bot-channels.spec.ts',
    'manager-media.spec.ts',
    'slider-download.spec.ts',
    'media-cache-heic.spec.ts'
  ],
  workers: 1,
  timeout: 90000,
  expect: { timeout: 30000 },
  use: {
    baseURL: 'http://127.0.0.1:4313',
    channel: process.env.PLAYWRIGHT_CHANNEL,
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'bun x vite --config vite.manager.config.ts',
    url: 'http://127.0.0.1:4313/e2e/fixtures/manager-reuse.html',
    reuseExistingServer: false
  },
  reporter: 'list'
});
