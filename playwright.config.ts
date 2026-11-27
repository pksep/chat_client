import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',
  testIgnore: '**/telemetry-storage.spec.ts',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:5173',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry'
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 5'] }
    },
    {
      name: 'webkit-desktop',
      testMatch: [
        'macos-desktop.spec.ts',
        'macos-form-styles.spec.ts',
        'image-editor-desktop.spec.ts',
        'compact-call-layout.spec.ts',
        'pinned-messages-list.spec.ts',
        'desktop-shell.spec.ts',
        'file-download-cancel.spec.ts',
        'browser-file-download.spec.ts',
        'telemetry-location.spec.ts',
        'desktop-app-download.spec.ts',
        'message-reaction-picker-position.spec.ts',
        'forward-modal-desktop.spec.ts',
        'creation-modal-desktop.spec.ts'
      ],
      use: { ...devices['Desktop Safari'] }
    },
    {
      name: 'webkit-iphone-pwa',
      testMatch: [
        'ios-pwa.spec.ts',
        'history-entry.spec.ts',
        'ios-compact-modals.spec.ts',
        'startup-logo.spec.ts',
        'slider-pdf-loading.spec.ts',
        'media-preview-recovery.spec.ts',
        'slider-download-focus.spec.ts',
        'call-download.spec.ts',
        'browser-file-download.spec.ts',
        'unanswered-call.spec.ts',
        'content-editor-button-colors.spec.ts',
        'ios-requests.spec.ts',
        'ios-web-push.spec.ts',
        'group-editing.spec.ts',
        'content-editor-mentions.spec.ts',
        'mention-delivery.spec.ts',
        'mention-sound.spec.ts',
        'incoming-call-dismissal.spec.ts',
        'menu-update.spec.ts',
        'web-daily-update.spec.ts',
        'profile-qr-login.spec.ts',
        'qr-login.spec.ts',
        'qr-session.spec.ts',
        'pts-snapshot-recovery.spec.ts',
        'unread-and-pinned-history.spec.ts',
        'message-deletion-animation.spec.ts',
        'message-arrival-animation.spec.ts',
        'external-avatar.spec.ts'
      ],
      use: { ...devices['iPhone 13'] }
    }
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'bun run start:dev',
    url: 'http://localhost:5173',
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI
  }
});
