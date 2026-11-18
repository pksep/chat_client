import { expect, test } from '@playwright/test';

test.setTimeout(90_000);
test.skip(({ isMobile }) => isMobile, 'Проверка окна настольного клиента');

for (const height of [800, 640, 400]) {
  test(`пересылка помещается под хедером Tauri при высоте ${height}`, async ({
    page
  }, testInfo) => {
    await page.setViewportSize({ width: 1000, height });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/__forward-modal')
        return route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div>'
        });
      return ['localhost', '127.0.0.1'].includes(url.hostname)
        ? route.continue()
        : route.abort();
    });
    await page.goto('/__forward-modal');
    await page.evaluate(async () => {
      document.documentElement.classList.add('chat-desktop-custom-chrome');
      const fixture = await import(
        /* @vite-ignore */ '/e2e/fixtures/forward-modal-harness.ts'
      );
      (window as any).forwardModal = await fixture.mountForwardModalFixture();
    });
    const modal = page.locator('dialog.message-forward-modal');
    await expect(modal).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('forward-modal.png') });
    const bounds = await modal.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(36 + 12);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height - 12);
    const header = modal.locator('.new-contact__header');
    await expect(header).toBeInViewport({ ratio: 1 });
    const list = modal.locator('.contact-selector__list');
    await list.evaluate(element => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(list.locator('.contact-selector__item').last()).toBeInViewport(
      { ratio: 1 }
    );
    await expect(header).toBeInViewport({ ratio: 1 });
  });
}
