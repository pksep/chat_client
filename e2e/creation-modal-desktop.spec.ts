import { expect, test, type Page } from '@playwright/test';

test.setTimeout(90_000);
test.skip(({ isMobile }) => isMobile, 'Проверка окна настольного клиента');

async function openCreation(
  page: Page,
  mode: string,
  width: number,
  height: number
) {
  await page.setViewportSize({ width, height });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/__creation-modal')
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div>'
      });
    return ['localhost', '127.0.0.1'].includes(url.hostname)
      ? route.continue()
      : route.abort();
  });
  await page.goto(
    `/__creation-modal?mode=${mode}&long&theme=${height === 400 ? 'dark' : 'light'}`
  );
  await page.evaluate(async mode => {
    document.documentElement.classList.add('chat-desktop-custom-chrome');
    if (mode === 'forward') {
      const fixture = await import(
        /* @vite-ignore */ '/e2e/fixtures/forward-modal-harness.ts'
      );
      (window as any).forwardModal = await fixture.mountForwardModalFixture();
    } else {
      await import(
        /* @vite-ignore */ '/e2e/fixtures/contact-selector-layout.ts'
      );
    }
  }, mode);
}

for (const mode of ['contact', 'bot']) {
  for (const height of [640, 400]) {
    test(`${mode}: содержимое и закрытие доступны при высоте ${height}`, async ({
      page
    }, testInfo) => {
      await openCreation(page, mode, 1000, height);
      const modal = page.locator(
        mode === 'bot' ? 'dialog.new-bot' : 'dialog.new-contact'
      );
      await expect(modal).toBeVisible();
      const bounds = await modal.boundingBox();
      expect(bounds!.y).toBeGreaterThanOrEqual(48);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height - 12);
      const header = modal.locator('.new-contact__header');
      if (mode === 'bot') {
        await modal.getByPlaceholder('Введите название').fill('Тестовый бот');
        await modal
          .getByPlaceholder('только a-z, 0-9, _')
          .fill('layout_test_bot');
        const action = modal.getByRole('button', {
          name: 'Создать',
          exact: true
        });
        await action.scrollIntoViewIfNeeded();
        await expect(action).toBeEnabled();
        await expect(action).toBeInViewport({ ratio: 1 });
      } else {
        const list = modal.locator('.contact-selector__list');
        await list.evaluate(element => {
          element.scrollTop = element.scrollHeight;
        });
        await expect(
          list.locator('.contact-selector__item').last()
        ).toBeInViewport({ ratio: 1 });
        const search = modal.locator('.contact-selector__search input');
        await search.fill('нет_такого_контакта');
        await expect(
          modal.locator('.contact-selector__empty-title')
        ).toBeInViewport({ ratio: 1 });
        await search.fill('');
      }
      await expect(header).toBeInViewport({ ratio: 1 });
      expect(
        await modal.evaluate(
          element => element.scrollHeight - element.clientHeight
        )
      ).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: testInfo.outputPath('creation-modal.png')
      });
      await header.locator('button').click();
      await expect(modal).not.toBeVisible();
    });
  }
}

for (const mode of ['contact-mobile', 'bot-mobile', 'forward']) {
  test(`${mode}: узкое окно Tauri учитывает хедер`, async ({ page }) => {
    await openCreation(page, mode, 700, 640);
    const modal = page.locator('dialog.mobile__modal').first();
    await expect(modal).toBeVisible();
    await expect
      .poll(async () => {
        const bounds = await modal.boundingBox();
        return bounds!.y + bounds!.height;
      })
      .toBeLessThanOrEqual(640);
    expect((await modal.boundingBox())!.y).toBeGreaterThanOrEqual(36);
    const header = modal.locator('.mobile__modal-header');
    await expect(header).toBeInViewport({ ratio: 1 });
    const list = modal.locator('.contact-selector__list');
    if (await list.count()) {
      await list.evaluate(element => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(
        list.locator('.contact-selector__item').last()
      ).toBeInViewport({ ratio: 1 });
    } else {
      await modal.getByPlaceholder('Введите название').fill('Тестовый бот');
      await modal
        .getByPlaceholder('только a-z, 0-9, _')
        .fill('layout_test_bot');
      await expect(
        modal.getByRole('button', { name: 'Создать', exact: true })
      ).toBeEnabled();
    }
  });
}
