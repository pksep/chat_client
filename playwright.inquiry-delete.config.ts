import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'client-chat-delete.spec.ts',
  workers: 1,
  retries: 0,
  reporter: 'line',
  use: { baseURL: 'http://127.0.0.1:5322', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } }
  ],
  webServer: {
    command: 'bun run start:dev --host 127.0.0.1 --port 5322 --strictPort',
    url: 'http://127.0.0.1:5322',
    timeout: 120000,
    reuseExistingServer: false
  }
});
