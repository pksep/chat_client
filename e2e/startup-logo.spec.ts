import { expect, test } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true
});

for (const theme of ['light', 'dark']) {
  test(`логотип PWA виден до загрузки приложения и исчезает после готовности: ${theme}`, async ({
    page
  }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: theme as 'light' | 'dark' });
    await page.addInitScript(theme => {
      Object.defineProperty(navigator, 'userAgent', {
        value:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
      });
      Object.defineProperty(navigator, 'standalone', { value: true });
      localStorage.setItem('erp-theme-color-scheme', `theme-${theme}`);
    }, theme);
    let release!: () => void;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    await page.route('**/src/main.ts', async route => {
      await pending;
      await route.continue();
    });
    await page.route('**/*', route =>
      ['localhost', '127.0.0.1'].includes(
        new URL(route.request().url()).hostname
      )
        ? route.fallback()
        : route.abort()
    );
    try {
      await page.goto('/', { waitUntil: 'commit' });
      const logo = page.locator(`.startup-shell__logo--${theme}`);
      await expect(logo).toBeVisible();
      await expect(logo).toHaveJSProperty('complete', true);
      expect(
        await logo.evaluate((el: HTMLImageElement) => el.naturalWidth)
      ).toBeGreaterThan(0);
      const box = (await logo.boundingBox())!;
      expect(box.x + box.width / 2).toBeCloseTo(195, 0);
      expect(box.y + box.height / 2).toBeCloseTo(422, 0);
      const startupImages = await page
        .locator('link[rel="apple-touch-startup-image"]')
        .evaluateAll(links =>
          links
            .filter(link => matchMedia((link as HTMLLinkElement).media).matches)
            .map(link => (link as HTMLLinkElement).getAttribute('href'))
        );
      expect(startupImages).toEqual([
        `/images/ios-splash/${theme}-1170x2532.png`
      ]);
      const response = await page.request.get(startupImages[0]!);
      expect(response.ok()).toBe(true);
      const png = await response.body();
      expect([...png.subarray(0, 8)]).toEqual([
        137, 80, 78, 71, 13, 10, 26, 10
      ]);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([
        1170, 2532
      ]);
      const pixels = await page.evaluate(async href => {
        const image = new Image();
        image.src = href;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const pixel = (x: number, y: number) =>
          [...context.getImageData(x, y, 1, 1).data].slice(0, 3);
        const x = canvas.width / 2;
        const y = canvas.height / 2;
        return {
          background: [
            pixel(0, 0),
            pixel(x - 220, y),
            pixel(x + 220, y),
            pixel(x, y - 220),
            pixel(x, y + 220)
          ],
          center: pixel(x, y)
        };
      }, startupImages[0]!);
      const background = theme === 'dark' ? [33, 37, 49] : [248, 249, 253];
      for (const pixel of pixels.background)
        pixel.forEach((value, index) =>
          expect(Math.abs(value - background[index])).toBeLessThanOrEqual(1)
        );
      expect(pixels.center).not.toEqual(background);
      await expect(page.locator('.startup-shell__content')).toBeHidden();
      // В первом кадре только изображение: шрифты задержанного приложения
      // не должны блокировать снимок в WebKit.
      const fontWait = process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;
      process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
      try {
        await page.screenshot({
          path: testInfo.outputPath(`startup-logo-${theme}.png`),
          animations: 'disabled'
        });
      } finally {
        if (fontWait === undefined)
          delete process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;
        else process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = fontWait;
      }
    } finally {
      release();
    }
    await expect(page.locator('.authorization-screen')).toBeVisible({
      timeout: 60_000
    });
    await expect(page.locator('#startup-shell')).toHaveCount(0);
  });
}
