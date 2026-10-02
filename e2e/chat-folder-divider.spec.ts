import { readFileSync } from 'node:fs';
import { expect, test, type Locator } from '@playwright/test';

const startupHtml = readFileSync(
  new URL('../index.html', import.meta.url),
  'utf8'
).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');

const dividerStyle = (rail: Locator) =>
  rail.evaluate(element => {
    const style = getComputedStyle(element, '::after');
    return {
      width: style.width,
      color: style.backgroundColor,
      right: style.right,
      pointerEvents: style.pointerEvents,
      physicalWidth: parseFloat(style.width) * devicePixelRatio
    };
  });

for (const deviceScaleFactor of [1, 1.25, 1.5, 2, 3]) {
  for (const theme of ['light', 'dark']) {
    test(`Разделитель папок и скелетона виден при DPR ${deviceScaleFactor}: ${theme}`, async ({
      browser,
      isMobile
    }, testInfo) => {
      test.skip(isMobile, 'Вертикальный разделитель используется на десктопе');
      const context = await browser.newContext({
        viewport: { width: 900, height: 720 },
        deviceScaleFactor
      });
      try {
        const page = await context.newPage();
        const expected = {
          width: deviceScaleFactor >= 2 ? '0.5px' : '1px',
          color: theme === 'dark' ? 'rgb(96, 104, 132)' : 'rgb(231, 231, 231)',
          right: '0px',
          pointerEvents: 'none'
        };
        await page.goto(
          'http://localhost:5173/e2e/fixtures/chat-folder-loading.html'
        );
        await page.locator('html').evaluate((element, theme) => {
          element.dataset.theme = theme;
        }, theme);
        const rail = page.locator('.chat-folder-rail');
        await expect(rail).toHaveCSS('width', '90px');
        await expect.poll(() => dividerStyle(rail)).toMatchObject(expected);
        expect((await dividerStyle(rail)).physicalWidth).toBeGreaterThanOrEqual(
          1
        );
        await rail.screenshot({
          path: testInfo.outputPath('folder-divider.png')
        });

        await page.route('**/startup-folder-divider-check', route =>
          route.fulfill({ contentType: 'text/html', body: startupHtml })
        );
        await page.goto('http://localhost:5173/startup-folder-divider-check');
        await page.locator('html').evaluate((element, theme) => {
          element.classList.add(`theme-${theme}`);
        }, theme);
        const startupRail = page.locator('.startup-shell__folders');
        await expect(startupRail).toHaveCSS('width', '90px');
        await expect
          .poll(() => dividerStyle(startupRail))
          .toMatchObject({ ...expected, pointerEvents: 'auto' });
        expect(
          (await dividerStyle(startupRail)).physicalWidth
        ).toBeGreaterThanOrEqual(1);
      } finally {
        await context.close();
      }
    });
  }
}
