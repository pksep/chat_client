import { expect, test } from '@playwright/test';

test('мобильная пересылка показывает emoji, избранное и весь список', async ({
  page
}) => {
  await page.setViewportSize({ width: 392, height: 832 });
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.route('**/*', route => {
    const url = new URL(route.request().url());

    if (url.pathname === '/__forward-modal') {
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div>'
      });
    }

    return ['localhost', '127.0.0.1'].includes(url.hostname)
      ? route.continue()
      : route.abort();
  });

  await page.goto('/__forward-modal');
  await page.evaluate(async () => {
    const fixture = await import(
      /* @vite-ignore */ '/e2e/fixtures/forward-modal-harness.ts'
    );
    (window as any).forwardModal = await fixture.mountForwardModalFixture();
  });

  const modal = page.locator('dialog.message-forward-modal');
  const list = modal.locator('.contact-selector__list');
  await expect(modal).toBeVisible();
  await expect(modal).toHaveCSS('border-top-left-radius', '0px');
  await expect(modal).toHaveCSS('border-top-right-radius', '0px');
  await expect(list).toHaveCSS('align-content', 'start');
  await expect(page.getByRole('button', { name: 'Избранные' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Чаты' })).toHaveClass(
    /chats-toolbar__filter-button--active/
  );
  await expect(list.locator('.contact-selector__item')).toHaveCount(29);
  await expect(list.locator('.contact-selector__item').first()).toContainText(
    'Избранное'
  );

  const previewEmoji = list
    .locator('.user-profile__ex .emoji-glyph[data-emoji-value="🚀"]')
    .first();
  await expect(previewEmoji).toBeVisible();
  await expect(previewEmoji.locator('.emoji-glyph__image')).toHaveJSProperty(
    'complete',
    true
  );

  const emojiGeometry = await previewEmoji.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const lineBounds = element.parentElement!.getBoundingClientRect();
    const style = getComputedStyle(element);

    return {
      height: bounds.height,
      minHeight: Number.parseFloat(style.minHeight),
      clippedAbove: lineBounds.top - bounds.top,
      clippedBelow: bounds.bottom - lineBounds.bottom
    };
  });
  expect(emojiGeometry.height).toBeGreaterThanOrEqual(emojiGeometry.minHeight);
  expect(emojiGeometry.clippedAbove).toBeLessThanOrEqual(1);
  expect(emojiGeometry.clippedBelow).toBeLessThanOrEqual(1);

  const listGeometry = await list.evaluate(element => {
    element.scrollTop = element.scrollHeight;
    const lastItem = element.lastElementChild as HTMLElement;
    const listBounds = element.getBoundingClientRect();
    const itemBounds = lastItem.getBoundingClientRect();
    const modalContentBounds = element
      .closest('.mobile__modal-content')!
      .getBoundingClientRect();

    return {
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      itemTop: itemBounds.top,
      itemBottom: itemBounds.bottom,
      listTop: listBounds.top,
      contentBottom: modalContentBounds.bottom
    };
  });
  expect(listGeometry.scrollHeight).toBeGreaterThan(listGeometry.clientHeight);
  expect(listGeometry.itemTop).toBeGreaterThanOrEqual(listGeometry.listTop);
  expect(listGeometry.itemBottom).toBeLessThanOrEqual(
    listGeometry.contentBottom - 8
  );

  await expect(
    list.locator('.emoji-glyph[data-emoji-value="🚀"]').first()
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
});
