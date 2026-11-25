import { expect, test, type Page } from '@playwright/test';

test.setTimeout(90_000);
test.skip(
  ({ isMobile }) => isMobile,
  'Проверка настольного редактора изображения'
);

async function openEditor(page: Page, theme: string) {
  await page.route('**/*', route =>
    ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort()
  );
  await page.goto('/e2e/fixtures/tauri-file-input.html', {
    waitUntil: 'domcontentloaded'
  });
  await page.evaluate(theme => {
    document.body.classList.add(
      'chat-tauri-runtime',
      'chat-tauri-macos-runtime'
    );
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.setProperty('--desktop-content-top', '36px');
  }, theme);
  await page.addStyleTag({
    content:
      ':where(dialog.modal-yui-kit_center) { height: auto; inset-block: 0; }'
  });
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 560;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#77aacc';
    context.fillRect(0, 0, 900, 560);
    context.fillStyle = '#ddbb88';
    context.fillRect(180, 120, 440, 320);
    return canvas.toDataURL().split(',')[1];
  });
  await expect(page.locator('.tiptap').first()).toBeVisible();
  await page.locator('.attach-file-button:visible').click();
  const chooser = page.waitForEvent('filechooser');
  await page
    .locator('.attach-file-popover .popover-yui-kit__content:visible')
    .getByText('Фото или видео', { exact: true })
    .click();
  await (
    await chooser
  ).setFiles({
    name: 'редактор.png',
    mimeType: 'image/png',
    buffer: Buffer.from(image, 'base64')
  });
  await page.locator('.attach-modal__media-tile-edit').click();
  await expect(page.locator('.image-attachment-editor__canvas')).toBeVisible();
}

for (const theme of ['light', 'dark']) {
  for (const height of [800, 400]) {
    test(`редактор и сброс по содержимому, ${theme}, ${height}px`, async ({
      page
    }, testInfo) => {
      await page.setViewportSize({ width: 1124, height });
      await openEditor(page, theme);
      const modal = page.locator('dialog.attach-modal-container--image-editor');
      const footer = page.locator('.image-attachment-editor__footer');
      await expect(
        footer.getByRole('button', { name: 'Применить' })
      ).toBeInViewport({ ratio: 1 });
      const geometry = await modal.evaluate(element => ({
        top: element.getBoundingClientRect().top,
        bottom: element.getBoundingClientRect().bottom,
        emptyBottom:
          element.getBoundingClientRect().bottom -
          element
            .querySelector('.image-attachment-editor__footer')!
            .getBoundingClientRect().bottom
      }));
      expect(geometry.top).toBeGreaterThanOrEqual(36);
      expect(geometry.bottom).toBeLessThanOrEqual(height);
      expect(geometry.emptyBottom).toBeLessThan(32);
      await page
        .locator(
          '.image-attachment-editor [aria-label="Повернуть вправо"] button'
        )
        .click();
      await page
        .locator('.image-attachment-editor [aria-label="Сброс"] button')
        .click();
      const reset = page.getByTestId('ImageAttachmentEditor-ResetConfirm');
      await expect(reset).toBeVisible();
      expect((await reset.boundingBox())!.height).toBeLessThan(260);
      await expect(
        reset.getByRole('button', { name: 'Да', exact: true })
      ).toBeInViewport({ ratio: 1 });
      await page.screenshot({
        path: testInfo.outputPath('image-editor-reset.png')
      });
      await reset.getByRole('button', { name: 'Нет', exact: true }).click();
      await expect(reset).toHaveCount(0);
      await expect(modal).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('image-editor.png') });
    });
  }

  test(`подсказки рядом с инструментами и после resize, ${theme}`, async ({
    page
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openEditor(page, theme);
    for (const label of ['Рисовать', 'Текст', 'Сброс', 'Повернуть вправо']) {
      const trigger = page.locator(
        `.image-attachment-editor [aria-label="${label}"]`
      );
      await trigger.hover();
      const hint = page
        .locator('.tooltip-yui-kit__hint')
        .getByText(label, { exact: true });
      await expect(hint).toBeVisible();
      const button = (await trigger.boundingBox())!;
      await expect
        .poll(async () => {
          const bounds = await hint.boundingBox();
          return bounds
            ? Math.abs(
                bounds.x + bounds.width / 2 - button.x - button.width / 2
              )
            : 1000;
        })
        .toBeLessThan(3);
      await page.mouse.move(5, 5);
      await expect(hint).toHaveCount(0);
    }
    await page.setViewportSize({ width: 1000, height: 640 });
    const trigger = page.locator(
      '.image-attachment-editor [aria-label="Рисовать"]'
    );
    await trigger.hover();
    const hint = page
      .locator('.tooltip-yui-kit__hint')
      .getByText('Рисовать', { exact: true });
    await expect(hint).toBeVisible();
    const button = (await trigger.boundingBox())!;
    await expect
      .poll(async () => {
        const bounds = (await hint.boundingBox())!;
        return Math.abs(
          bounds.x + bounds.width / 2 - button.x - button.width / 2
        );
      })
      .toBeLessThan(3);
    await page.screenshot({
      path: testInfo.outputPath('image-editor-tooltip.png')
    });
  });
}
