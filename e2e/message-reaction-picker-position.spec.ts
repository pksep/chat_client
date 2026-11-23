import { expect, test } from '@playwright/test';
import { openFixture, openTopic } from './fixtures/topic-performance-page';

test.describe.configure({ mode: 'default' });
test.setTimeout(60_000);
test.skip(({ isMobile }) => isMobile);

for (const desktopChrome of [false, true]) {
  test(`панель реакций заменяет меню при повторных открытиях (${desktopChrome ? 'хедер Tauri' : 'браузер'})`, async ({
    page
  }, testInfo) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    const { errors } = await openFixture(page, { count: 1, shell: true });
    await openTopic(page, 0);
    await page.evaluate(desktopChrome => {
      document.documentElement.dataset.theme = 'dark';
      if (desktopChrome) {
        document.documentElement.classList.add('chat-desktop-custom-chrome');
      }
    }, desktopChrome);
    const message = page.locator('[data-message-id="performance-0-message-0"]');
    await expect(message).toBeVisible();
    const menu = page.locator('.message-context-menu');

    for (const [index, point] of [
      { clientX: 650, clientY: 350 },
      { clientX: 780, clientY: 430 },
      { clientX: 1100, clientY: 760 },
      { clientX: 500, clientY: 20 }
    ].entries()) {
      await message.evaluate((element, point) => {
        element.dispatchEvent(
          new MouseEvent('contextmenu', {
            ...point,
            bubbles: true,
            cancelable: true
          })
        );
      }, point);
      await expect(menu.locator('.select-reactions--ready')).toBeVisible();
      const before = (await menu.boundingBox())!;
      await menu.locator('.select-reactions-list-button').click();
      const picker = menu.locator('.message-context-menu__emoji-picker--ready');
      await expect(picker).toBeVisible();
      const viewport = await page.evaluate(() => ({
        right: window.visualViewport?.width ?? innerWidth,
        bottom: window.visualViewport?.height ?? innerHeight
      }));
      // Изменение размера может лишь подвинуть панель внутрь окна.
      await expect
        .poll(async () => {
          const after = (await menu.boundingBox())!;
          return Math.abs(
            after.y - Math.min(before.y, viewport.bottom - after.height - 8)
          );
        })
        .toBeLessThanOrEqual(1);
      const after = (await menu.boundingBox())!;
      expect(
        Math.abs(after.x - Math.min(before.x, viewport.right - after.width - 8))
      ).toBeLessThanOrEqual(1);
      expect(after.x).toBeGreaterThanOrEqual(8);
      expect(after.y).toBeGreaterThanOrEqual(desktopChrome ? 36 : 8);
      expect(after.x + after.width).toBeLessThanOrEqual(viewport.right - 8);
      expect(after.y + after.height).toBeLessThanOrEqual(viewport.bottom - 8);
      await expect(picker.locator('.v3-search input')).toBeInViewport();
      await expect(picker.locator('.v3-groups')).toBeInViewport();
      await page.screenshot({
        path: testInfo.outputPath(`reaction-picker-${index + 1}.png`)
      });
      await page.mouse.click(10, 790);
      await expect(menu).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}
