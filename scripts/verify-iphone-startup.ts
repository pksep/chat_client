import { chromium, webkit, devices, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Первый кадр содержит только изображение; ожидаемые CSS намеренно задержаны.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';

const output = resolve('.tmp/iphone-startup');
await mkdir(output, { recursive: true });
const html = await readFile('build/index.html', 'utf8');
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch({ timeout: 15_000 });
  try {
    for (const theme of ['light', 'dark'] as const) {
      const context = await browser.newContext({
        ...devices['iPhone 13'],
        colorScheme: theme,
        serviceWorkers: 'block'
      });
      try {
        const page = await context.newPage();
        page.setDefaultNavigationTimeout(15_000);
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(theme => {
          Object.defineProperty(navigator, 'standalone', { value: true });
          localStorage.setItem('erp-theme-color-scheme', `theme-${theme}`);
        }, theme);
        let release!: () => void;
        const pending = new Promise<void>(resolve => {
          release = resolve;
        });
        await page.route('**/*', async route => {
          const url = new URL(route.request().url());
          if (url.hostname !== '127.0.0.1') return route.abort();
          if (url.pathname === '/')
            return route.fulfill({ contentType: 'text/html', body: html });
          if (/\.(?:css|js|svg)$/.test(url.pathname)) await pending;
          await route.abort();
        });
        try {
          await page.goto('http://127.0.0.1:5197/', {
            waitUntil: 'commit'
          });
          const logo = page.locator(`.startup-shell__logo--${theme}`);
          await expect(logo).toBeVisible();
          await expect
            .poll(() =>
              logo.evaluate((image: HTMLImageElement) => image.naturalWidth)
            )
            .toBeGreaterThan(0);
          await logo.evaluate((image: HTMLImageElement) => image.decode());
          expect(
            await page.evaluate(
              () =>
                performance.getEntriesByName('chat-startup:modules-ready')
                  .length
            )
          ).toBe(0);
          const screenshot = await page.screenshot({ timeout: 5000 });
          await writeFile(
            resolve(output, `${engine.name()}-${theme}.png`),
            screenshot
          );
          const pixels = await page.evaluate(
            async data => {
              const image = new Image();
              image.src = data;
              await image.decode();
              const canvas = document.createElement('canvas');
              canvas.width = canvas.height = 1;
              const ctx = canvas.getContext('2d')!;
              const pixel = (x: number, y: number) => {
                ctx.drawImage(image, x, y, 1, 1, 0, 0, 1, 1);
                return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
              };
              return {
                corner: pixel(1, 1),
                center: pixel(image.naturalWidth / 2, image.naturalHeight / 2)
              };
            },
            `data:image/png;base64,${screenshot.toString('base64')}`
          );
          const background = theme === 'light' ? [248, 249, 253] : [33, 37, 49];
          expect(pixels.corner).toEqual(background);
          expect(pixels.center).not.toEqual(background);
          expect(errors).toEqual([]);
          console.log(
            `${engine.name()}, ${theme}: логотип виден до загрузки JS, CSS и внешних SVG`
          );
        } finally {
          release();
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
