import { expect, test } from '@playwright/test';

for (const theme of ['light', 'dark']) {
  test(`Первое и повторное открытие создания группы и бота плавное: ${theme}`, async ({
    page,
    isMobile
  }) => {
    test.skip(!isMobile, 'Мобильные модалки создания');
    await page.addInitScript(() => {
      (window as any).mobileModalAnimations = [];
      document.addEventListener('animationstart', event => {
        if (
          event.target instanceof HTMLDialogElement &&
          event.target.classList.contains('mobile__modal')
        ) {
          (window as any).mobileModalAnimations.push(event.animationName);
        }
      });
    });
    await page.goto(
      `/e2e/fixtures/contact-selector-layout.html?mode=creation&theme=${theme}`
    );
    await expect(page.locator('dialog.mobile__modal')).toHaveCount(0);
    for (const action of ['Group', 'Bot']) {
      for (let open = 0; open < 2; open++) {
        await page.evaluate(() => {
          (window as any).mobileModalAnimations = [];
        });
        await page
          .locator('[data-testid$="-ChatsToolbar-CreateButton"]')
          .click();
        await page
          .locator(
            `[data-testid$="-ChatsToolbar-Create${action}Button"]:visible`
          )
          .click();
        const dialog = page.locator('dialog.mobile__modal[open]');
        await expect(dialog).toBeVisible();
        await expect
          .poll(() =>
            page.evaluate(() => (window as any).mobileModalAnimations)
          )
          .toContainEqual(expect.stringMatching(/^slide-in-top-/));
        await dialog
          .locator('[data-testid$="-MobileModal-CloseButton"]')
          .click();
        await expect(dialog).toHaveCount(0);
      }
    }
  });
}
