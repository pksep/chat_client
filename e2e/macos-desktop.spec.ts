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

for (const width of [420, 700, 1124]) {
  for (const customChrome of [false, true]) {
    test(`Mac: удаление сообщения ${width}px, своя шапка ${customChrome}`, async ({
      page
    }, testInfo) => {
      await page.setViewportSize({ width, height: 766 });
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        return ['localhost', '127.0.0.1'].includes(url.hostname)
          ? route.continue()
          : route.abort();
      });
      await page.goto('/e2e/fixtures/ios-compact-modals.html');
      await page.evaluate(customChrome => {
        document.body.classList.add(
          'chat-tauri-runtime',
          'chat-tauri-macos-runtime'
        );
        document.documentElement.dataset.theme = 'dark';
        if (customChrome) {
          document.documentElement.classList.add('chat-desktop-custom-chrome');
        }
      }, customChrome);
      await page.getByRole('button', { name: 'delete', exact: true }).click();

      const modal = page.locator('dialog[open]');
      await expect(
        modal.getByRole('heading', { name: 'Удалить сообщение', exact: true })
      ).toBeVisible();
      await expect(modal).not.toHaveClass(
        /(?:fade-and-scale|slide-bottom)-enter-/
      );
      await expect(modal).toHaveCSS('opacity', '1');
      await page.screenshot({
        path: testInfo.outputPath('delete-modal.png'),
        animations: 'disabled'
      });
      const geometry = await modal.evaluate(dialog => {
        const rect = dialog.getBoundingClientRect();
        const content = dialog
          .querySelector('.modal-yui-kit__modal-content')!
          .getBoundingClientRect();
        const title = dialog
          .querySelector('.confirm__modal__title')!
          .getBoundingClientRect();
        const buttons = Array.from(dialog.querySelectorAll('button')).map(
          button => button.getBoundingClientRect()
        );
        return {
          height: rect.height,
          width: rect.width,
          x: rect.x,
          y: rect.y,
          bottom: rect.bottom,
          contentOverflow: dialog.scrollHeight - dialog.clientHeight,
          centerOffset: Math.abs(
            (title.left + title.right - rect.left - rect.right) / 2
          ),
          contentWidth: content.width,
          buttons: buttons.map(button => ({
            x: button.x,
            y: button.y,
            right: button.right,
            bottom: button.bottom
          }))
        };
      });
      await testInfo.attach('geometry', {
        body: JSON.stringify(geometry),
        contentType: 'application/json'
      });
      expect(geometry.height).toBeLessThan(400);
      expect(geometry.centerOffset).toBeLessThanOrEqual(1);
      expect(geometry.contentOverflow).toBeLessThanOrEqual(1);
      expect(geometry.y).toBeGreaterThanOrEqual(customChrome ? 36 : 0);
      expect(geometry.bottom).toBeLessThanOrEqual(766);
      expect(geometry.width).toBeLessThanOrEqual(width);
      for (const button of geometry.buttons) {
        expect(button.x).toBeGreaterThanOrEqual(geometry.x);
        expect(button.right).toBeLessThanOrEqual(geometry.x + geometry.width);
        expect(button.bottom).toBeLessThanOrEqual(geometry.bottom);
      }
      await modal.getByRole('button', { name: 'Нет', exact: true }).click();
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      await expect(page.getByTestId('confirmed')).toHaveText('0');
      await page.getByRole('button', { name: 'delete', exact: true }).click();
      await page
        .locator('dialog[open]')
        .getByRole('button', { name: 'Да', exact: true })
        .click();
      await expect(page.getByTestId('confirmed')).toHaveText('1');
    });
  }
}
