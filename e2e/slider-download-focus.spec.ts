import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';
const WEBP_BODY = Buffer.from(
  'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
  'base64'
);

test('скачивание картинки из слайдера сохраняет фокус и не открывает вкладку', async ({
  page,
  context
}) => {
  let downloadRequests = 0;
  const server = createServer((_request, response) => {
    downloadRequests++;
    response.writeHead(200, {
      'Content-Type': 'image/webp',
      'Content-Disposition': 'attachment; filename="image.png"',
      'Content-Length': String(WEBP_BODY.length),
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(WEBP_BODY);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  try {
    await page.route('**/__download-preview.webp', route =>
      route.fulfill({ contentType: 'image/webp', body: WEBP_BODY })
    );
    await page.goto('/e2e/fixtures/slider-download.html');
    await page.evaluate(async port => {
      (window as any).downloadFocusLosses = 0;
      window.addEventListener('blur', () => {
        (window as any).downloadFocusLosses++;
      });
      window.addEventListener('beforeunload', () => {
        (window as any).downloadFocusLosses++;
      });
      const fixture = await import('/e2e/fixtures/slider-download-harness.ts');
      (window as any).sliderDownloadFixture =
        await fixture.mountSliderDownloadFixture([
          {
            path: `${location.origin}/__download-preview.webp`,
            downloadPath: `http://127.0.0.1:${port}/api/media/object/favorite.webp?downloadName=image.png`,
            name: 'image.png'
          }
        ]);
    }, port);
    const initialUrl = page.url();
    let popups = 0;
    context.on('page', () => popups++);
    for (let index = 0; index < 2; index++) {
      const downloadPromise = page.waitForEvent('download');
      await page
        .locator('.slider-modal__sub-nav:last-child .slider-modal__side-button')
        .first()
        .click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('image.png');
      expect(await download.failure()).toBeNull();
      await expect(page.locator('dialog[open]')).toBeVisible();
    }
    expect(downloadRequests).toBe(2);
    expect(popups).toBe(0);
    expect(page.url()).toBe(initialUrl);
    expect(await page.evaluate(() => (window as any).downloadFocusLosses)).toBe(
      0
    );
    await page.screenshot({
      path: test.info().outputPath('download-in-chat.png')
    });
    await page.evaluate(() => (window as any).sliderDownloadFixture.unmount());
    await expect(
      page.locator('iframe[title="Скачивание вложения"]')
    ).toHaveCount(0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
