import { expect, test } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  isMobile: true,
  hasTouch: true
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'standalone', { value: true })
  );
  await page.goto('/e2e/fixtures/ios-compact-modals.html');
});

for (const [name, title, cancel, confirm] of [
  ['delete', 'Удалить сообщение', 'Нет', 'Да'],
  ['pin', 'Закрепить сообщение', 'Нет', 'Да'],
  ['vpn', 'Похоже, у вас включён VPN', 'Закрыть', 'Перейти в настройки']
]) {
  test(`подтверждение ${name} остаётся компактным снизу и сохраняет действия`, async ({
    page
  }, testInfo) => {
    await page.getByRole('button', { name, exact: true }).click();
    const dialog = page.locator('dialog[open]');
    await expect(
      dialog.getByRole('heading', { name: title, exact: true })
    ).toBeVisible();
    await expect
      .poll(async () => {
        const box = (await dialog.boundingBox())!;
        return Math.round(box.y + box.height);
      })
      .toBe(844);
    const box = (await dialog.boundingBox())!;
    expect(box.height).toBeLessThan(450);
    expect(box.width).toBe(390);
    for (const label of [cancel, confirm]) {
      const button = dialog.getByRole('button', { name: label, exact: true });
      await expect(button).toBeVisible();
      const bounds = (await button.boundingBox())!;
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(810);
    }
    await page.screenshot({
      path: testInfo.outputPath(`ios-${name}.png`),
      animations: 'disabled'
    });
    await dialog.getByRole('button', { name: cancel, exact: true }).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.getByTestId('confirmed')).toHaveText('0');
    await page.getByRole('button', { name, exact: true }).click();
    await page
      .locator('dialog[open]')
      .getByRole('button', { name: confirm, exact: true })
      .click();
    await expect(page.getByTestId('confirmed')).toHaveText('1');
  });
}

test('информационное окно группы сохраняет полную высоту', async ({ page }) => {
  await page.getByRole('button', { name: 'profile', exact: true }).click();
  const dialog = page.locator('dialog[open]');
  await expect
    .poll(async () => {
      const box = (await dialog.boundingBox())!;
      return [box.y, box.height];
    })
    .toEqual([0, 844]);
  await expect(
    dialog.getByRole('heading', { name: 'Информация группы' })
  ).toBeVisible();
});
