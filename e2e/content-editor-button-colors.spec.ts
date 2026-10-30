import { expect, test, type Locator, type Page } from '@playwright/test';

const tokenColor = (page: Page, token: string) =>
  page.evaluate(name => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);

const checkAuxiliaryButtons = async (page: Page, buttons: Locator) => {
  const neutral = await tokenColor(page, '--text-secondary');
  const brand = await tokenColor(page, '--text-brand');
  for (const button of await buttons.all()) {
    await expect(button).toHaveCSS('color', neutral);
    const icon = button.locator('svg').first();
    await expect(icon).toHaveCSS('color', neutral);
  }
  const first = buttons.first();
  await first.hover();
  await expect(first).toHaveCSS('color', neutral);
  await first.evaluate(element => element.classList.add('active'));
  await expect(first).toHaveCSS('color', brand);
  await first.evaluate(element => element.classList.remove('active'));
  await expect(first).toHaveCSS('color', neutral);
};

for (const theme of ['light', 'dark']) {
  test(`редактор ИИ ${theme}: управляющая кнопка сохраняет брендовый цвет`, async ({
    page,
    isMobile
  }) => {
    await page.goto(
      `/e2e/fixtures/content-editor-button-colors.html?theme=${theme}&kind=ai`
    );
    await expect(page.locator('.tiptap')).toBeVisible();
    await expect(
      page.locator('.ai-assistant__permission-trigger:visible')
    ).toHaveCSS(
      'color',
      await tokenColor(page, isMobile ? '--text-brand' : '--action-primary-bg')
    );
  });

  test(`редактор ${theme}: вспомогательные кнопки нейтральные, отправка и слоты сохраняют цвет`, async ({
    page,
    isMobile
  }) => {
    await page.goto(
      `/e2e/fixtures/content-editor-button-colors.html?theme=${theme}`
    );
    await expect(page.locator('.tiptap')).toBeVisible();
    const buttons = page.locator(
      '.editor-component .attach-file-button:visible, .editor-component .smile-button:visible, .editor-component > .toolbar > button.ghost-yui-kit:not(.right):visible'
    );
    await expect(buttons).toHaveCount(isMobile ? 2 : 4);
    await checkAuxiliaryButtons(page, buttons);
    await expect(
      page
        .getByRole('button', { name: 'Режим ИИ', exact: true })
        .filter({ visible: true })
    ).toHaveCSS('color', await tokenColor(page, '--text-brand'));
    await expect(page.locator('#outside-editor')).toHaveCSS(
      'color',
      await tokenColor(page, '--text-primary')
    );
    const send = page.locator('.editor-component button.right:visible');
    await expect(send).toBeEnabled();
    await expect(send).toHaveCSS(
      'color',
      await tokenColor(page, isMobile ? '--text-brand' : '--text-on-brand')
    );
    await page.screenshot({
      path: test.info().outputPath('editor-buttons.png')
    });
    await page.locator('.tiptap').fill('');
    if (isMobile) await expect(send).toHaveCount(0);
    else {
      await expect(send).toBeDisabled();
      await expect(send).toHaveCSS(
        'color',
        await tokenColor(page, '--action-disabled-bg')
      );
    }
  });

  test(`вложения ${theme}: скрепка, эмодзи, упоминания и команды используют нейтральный цвет`, async ({
    page
  }) => {
    await page.goto(
      `/e2e/fixtures/content-editor-button-colors.html?theme=${theme}`
    );
    await expect(page.locator('.tiptap')).toBeVisible();
    await page
      .locator('.attach-hidden-input:not([accept])')
      .first()
      .setInputFiles({
        name: 'review.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Проверка цветов')
      });
    await expect(page.locator('.attach-modal')).toBeVisible();
    const buttons = page.locator(
      '.attach-modal__toolbar-left button.ghost-yui-kit:visible'
    );
    await expect(buttons).toHaveCount(4);
    await checkAuxiliaryButtons(page, buttons);
    await expect(
      page.locator('.attach-modal__toolbar > button.right')
    ).toHaveCSS('color', await tokenColor(page, '--text-on-brand'));
    await page.screenshot({
      path: test.info().outputPath('attachment-buttons.png')
    });
  });
}
