import { expect, test, type Page } from '@playwright/test';

test.setTimeout(90_000);
test.skip(({ isMobile }) => isMobile, 'Проверка настольного WebView macOS');

async function prepareMac(page: Page) {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/__macos-form')
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div>'
      });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: [] });
    return ['localhost', '127.0.0.1'].includes(url.hostname)
      ? route.continue()
      : route.abort();
  });
}

async function applyMacClasses(page: Page, theme: string) {
  await page.evaluate(theme => {
    document.body.classList.add(
      'chat-tauri-runtime',
      'chat-tauri-macos-runtime'
    );
    document.documentElement.classList.add('chat-desktop-custom-chrome');
    document.documentElement.dataset.theme = theme;
  }, theme);
}

for (const theme of ['light', 'dark']) {
  test(`Mac: компактное подтверждение без зависимости от стандартного размера dialog, ${theme}`, async ({
    page
  }) => {
    await page.setViewportSize({ width: 1124, height: 766 });
    await prepareMac(page);
    await page.goto('/e2e/fixtures/ios-compact-modals.html');
    await applyMacClasses(page, theme);
    // Проверяем WebView, в котором dialog по умолчанию растягивается между inset.
    await page.addStyleTag({
      content:
        ':where(dialog.modal-yui-kit_center) { height: auto; inset-block: 0; }'
    });
    await page.getByRole('button', { name: 'delete', exact: true }).click();
    const modal = page.locator('dialog[open]');
    await expect(modal).toBeVisible();
    await expect(modal).not.toHaveClass(/fade-and-scale-enter-/);
    expect((await modal.boundingBox())!.height).toBeLessThan(280);
    await expect(
      modal.getByRole('button', { name: 'Да', exact: true })
    ).toBeInViewport({ ratio: 1 });
  });

  for (const height of [766, 360]) {
    test(`Mac: подтверждения по содержимому, ${theme}, высота ${height}`, async ({
      page
    }, testInfo) => {
      await page.setViewportSize({ width: 1124, height });
      await prepareMac(page);
      await page.goto('/e2e/fixtures/ios-compact-modals.html');
      await applyMacClasses(page, theme);
      let confirmed = 0;
      for (const action of ['delete', 'unpin', 'folder', 'logout']) {
        await page.getByRole('button', { name: action, exact: true }).click();
        const modal = page.locator('dialog[open]');
        await expect(modal).toBeVisible();
        await expect(modal).not.toHaveClass(/fade-and-scale-enter-/);
        const geometry = await modal.evaluate(element => {
          const box = element.getBoundingClientRect();
          const buttons = element
            .querySelector('.confirm__modal__buttons')!
            .getBoundingClientRect();
          return {
            y: box.y,
            bottom: box.bottom,
            height: box.height,
            emptyBottom: box.bottom - buttons.bottom,
            overflow: element.scrollHeight - element.clientHeight
          };
        });
        expect(geometry.height).toBeLessThan(280);
        expect(geometry.emptyBottom).toBeLessThan(30);
        expect(geometry.y).toBeGreaterThanOrEqual(36);
        expect(geometry.bottom).toBeLessThanOrEqual(height);
        expect(geometry.overflow).toBeLessThanOrEqual(1);
        await modal.screenshot({
          path: testInfo.outputPath(`${action}.png`),
          animations: 'disabled'
        });
        await modal.getByRole('button', { name: 'Нет', exact: true }).click();
        await expect(page.locator('dialog[open]')).toHaveCount(0);
        await expect(page.getByTestId('confirmed')).toHaveText(
          String(confirmed)
        );
        await page.getByRole('button', { name: action, exact: true }).click();
        await page
          .locator('dialog[open]')
          .getByRole('button', { name: 'Да', exact: true })
          .click();
        await expect(page.getByTestId('confirmed')).toHaveText(
          String(++confirmed)
        );
      }
    });
  }

  test(`Mac: поля создания бота видны на фоне модалки, ${theme}`, async ({
    page
  }, testInfo) => {
    await page.setViewportSize({ width: 1124, height: 766 });
    await prepareMac(page);
    await page.goto(`/__macos-form?mode=bot&theme=${theme}`);
    await applyMacClasses(page, theme);
    await page.evaluate(async () => {
      await import(
        /* @vite-ignore */ '/e2e/fixtures/contact-selector-layout.ts'
      );
    });
    const modal = page.locator('dialog.new-bot');
    await expect(modal).toBeVisible();
    const modalColor = await modal.evaluate(
      element => getComputedStyle(element).backgroundColor
    );
    for (const field of await modal
      .locator('.bot-editor__field fieldset')
      .all()) {
      await expect(field).toBeVisible();
      const color = await field.evaluate(
        element => getComputedStyle(element).backgroundColor
      );
      expect(color).not.toBe('rgba(0, 0, 0, 0)');
      expect(color).not.toBe(modalColor);
    }
    await modal.getByPlaceholder('Введите название').fill('Тестовый бот');
    await modal.getByPlaceholder('только a-z, 0-9, _').fill('macos_test_bot');
    await expect(
      modal.getByRole('button', { name: 'Создать', exact: true })
    ).toBeEnabled();
    await modal.screenshot({
      path: testInfo.outputPath('bot-inputs.png'),
      animations: 'disabled'
    });
  });

  test(`Mac: свой статус и hover выхода видны, ${theme}`, async ({
    page
  }, testInfo) => {
    await page.setViewportSize({ width: 1124, height: 900 });
    await prepareMac(page);
    await page.goto(`/e2e/fixtures/profile-qr-login.html?theme=${theme}`);
    await applyMacClasses(page, theme);
    await page
      .getByRole('button', { name: 'Установить статус', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Свой вариант', exact: true })
      .click();
    const editor = page.locator('.menu-profile__status-custom');
    const inputGroup = editor.locator(
      '.menu-profile__status-custom__input__group'
    );
    const editorColor = await editor.evaluate(
      element => getComputedStyle(element).backgroundColor
    );
    await expect(inputGroup).not.toHaveCSS('background-color', editorColor);
    await page
      .getByRole('textbox', { name: 'Текст статуса' })
      .fill('Проверка macOS');
    await expect(
      page.getByRole('textbox', { name: 'Текст статуса' })
    ).toHaveValue('Проверка macOS');
    await editor.screenshot({
      path: testInfo.outputPath('custom-status.png'),
      animations: 'disabled'
    });
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    const logout = page.getByRole('button', { name: 'Выйти', exact: true });
    await logout.scrollIntoViewIfNeeded();
    await page.mouse.move(1100, 0);
    const normal = await logout.evaluate(
      element => getComputedStyle(element).backgroundColor
    );
    await logout.hover();
    await expect(logout).not.toHaveCSS('background-color', normal);
    await logout.screenshot({
      path: testInfo.outputPath('logout-hover.png'),
      animations: 'disabled'
    });
    await logout.click();
    const confirmation = page
      .getByRole('dialog')
      .filter({ hasText: 'Выход из профиля' });
    await expect(confirmation).toBeVisible();
    await confirmation
      .getByRole('button', { name: 'Нет', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Выйти', exact: true })
    ).toBeVisible();
  });
}
