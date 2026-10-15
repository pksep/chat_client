import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

if (!process.env.TELEMETRY_LOCAL_API_URL) {
  throw new Error('Запустите bun run test:telemetry:local');
}

export default defineConfig({
  ...base,
  testMatch: 'telemetry-storage.spec.ts',
  testIgnore: [],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  maxFailures: 1,
  reporter: 'line',
  outputDir: `${process.env.TELEMETRY_LOCAL_OUTPUT_DIR}/playwright`,
  webServer: undefined,
  use: {
    ...base.use,
    baseURL: process.env.TELEMETRY_LOCAL_CLIENT_URL
  },
  projects: [{ name: 'telemetry-local', use: devices['Pixel 5'] }]
});
