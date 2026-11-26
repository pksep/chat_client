import { expect, test } from '@playwright/test';

test.use({ reducedMotion: 'no-preference' });

for (const mode of [
  { platform: 'Linux x86_64', tauri: true, snapshots: 0 },
  { platform: 'Linux x86_64', tauri: false, snapshots: 2 },
  { platform: 'Win32', tauri: true, snapshots: 2 },
  { platform: 'MacIntel', tauri: true, snapshots: 2 }
]) {
  test(`переход темы: ${mode.platform}, Tauri=${mode.tauri}`, async ({
    page
  }) => {
    await page.addInitScript(mode => {
      const win = window as any;
      Object.defineProperty(navigator, 'platform', { value: mode.platform });
      win.isTauri = mode.tauri;
      win.__TAURI_INTERNALS__ = { invoke: async () => undefined };
      win.themeSnapshots = 0;
      Object.defineProperty(document, 'startViewTransition', {
        value: (update: () => Promise<void>) => {
          win.themeSnapshots++;
          const done = Promise.resolve().then(update);
          return { ready: done, finished: done, skipTransition() {} };
        }
      });
    }, mode);
    await page.goto('/e2e/fixtures/theme-transition.html');
    await page.waitForFunction(() => Boolean((window as any).theme));
    for (const dark of [true, false]) {
      await page.evaluate(dark => (window as any).theme.setTheme(dark), dark);
      await expect(page.locator('html')).toHaveClass(
        new RegExp(dark ? 'theme-dark' : 'theme-light')
      );
    }
    expect(await page.evaluate(() => (window as any).themeSnapshots)).toBe(
      mode.snapshots
    );
    expect(
      await page.evaluate(() => localStorage.getItem('erp-theme-color-scheme'))
    ).toBe('theme-light');
  });
}
