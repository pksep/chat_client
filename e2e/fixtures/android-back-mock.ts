import type { Page } from '@playwright/test';

export async function installAndroidBackMock(page: Page) {
  await page.route('**/@capacitor_app.js*', route =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
        export const App = {
          async addListener(name, callback) {
            if (name !== 'backButton') return { remove: async () => {} };
            const root = document.documentElement;
            root.dataset.androidBackListeners = String(Number(root.dataset.androidBackListeners || 0) + 1);
            const listener = () => callback({ canGoBack: true });
            window.addEventListener('test-android-back', listener);
            return { remove: async () => window.removeEventListener('test-android-back', listener) };
          },
          async exitApp() {
            const root = document.documentElement;
            root.dataset.androidExits = String(Number(root.dataset.androidExits || 0) + 1);
          },
          async minimizeApp() {
            const root = document.documentElement;
            root.dataset.androidMinimizes = String(Number(root.dataset.androidMinimizes || 0) + 1);
          },
          async getInfo() { return { name: 'Тест', id: 'test', build: '1', version: '1' }; },
          async getState() { return { isActive: true }; },
          async getLaunchUrl() { return undefined; },
          async removeAllListeners() {}
        };
      `
    })
  );
}

export async function androidBack(page: Page) {
  await page.evaluate(() =>
    window.dispatchEvent(new Event('test-android-back'))
  );
}
