import base from './playwright.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  ...base,
  testMatch: 'client-inquiry-badges.spec.ts',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5317' },
  projects: base.projects?.map(project => ({
    ...project,
    use: { ...project.use, channel: 'chrome' }
  })),
  webServer: {
    command: 'bun run start:dev --host 127.0.0.1 --port 5317 --strictPort',
    url: 'http://127.0.0.1:5317',
    timeout: 120000,
    reuseExistingServer: false
  }
});
