import { expect, test } from '@playwright/test';

test.setTimeout(90_000);

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, 'Проверка настольного окна macOS');
});

for (const width of [562, 1124]) {
  test(`Mac: предпросмотр файла ${width}px занимает высоту содержимого`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 766 });
    await page.route('**/*', route =>
      ['localhost', '127.0.0.1'].includes(
        new URL(route.request().url()).hostname
      )
        ? route.continue()
        : route.abort()
    );
    await page.goto('/e2e/fixtures/tauri-file-input.html', {
      waitUntil: 'domcontentloaded'
    });
    await page.evaluate(() => {
      document.body.classList.add(
        'chat-tauri-runtime',
        'chat-tauri-macos-runtime'
      );
      document.documentElement.dataset.theme = 'dark';
    });
    await expect(page.locator('.tiptap').first()).toBeVisible({
      timeout: 60_000
    });
    await page.locator('.attach-file-button:visible').click();
    const chooser = page.waitForEvent('filechooser');
    await page
      .locator('.attach-file-popover .popover-yui-kit__content:visible')
      .getByText('Файл', { exact: true })
      .click();
    await (
      await chooser
    ).setFiles({
      name: 'запись-экрана.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('local fixture')
    });
    await expect(page.locator('.attach-modal__attachment-name')).toBeVisible();
    await page
      .locator('.attach-modal .tiptap')
      .fill(
        'После сворачивания окно должно открыться из Dock, а после обновления — перезапуститься.'
      );
    const geometry = await page
      .locator('dialog.attach-modal-container')
      .evaluate(dialog => {
        const box = dialog.getBoundingClientRect();
        const toolbar = dialog
          .querySelector('.attach-modal__toolbar')!
          .getBoundingClientRect();
        return {
          height: box.height,
          emptyBottom: box.bottom - toolbar.bottom,
          bottom: box.bottom
        };
      });
    expect(geometry.height).toBeLessThan(450);
    expect(geometry.emptyBottom).toBeLessThan(40);
    expect(geometry.bottom).toBeLessThan(766);
    await page.locator('.attach-modal .tiptap').press('Enter');
    await expect
      .poll(() => page.evaluate(() => (window as any).attachments.length))
      .toBe(1);
  });
}
