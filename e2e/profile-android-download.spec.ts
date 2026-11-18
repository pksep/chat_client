import { expect, test, type Page } from '@playwright/test';
import QRCode from 'qrcode';

const configUrl = 'https://pksep.github.io/sep-chat-ui/android-download.json';
const qrUrl = 'https://pksep.github.io/sep-chat-ui/assets/android-download.png';
const landingUrl = 'https://pksep.github.io/sep-chat-ui/android/';
const latestApk =
  'https://github.com/pksep/sep-chat-ui/releases/latest/download/SEP-Chat.apk';
const config = (apkUrl = latestApk) => ({
  schemaVersion: 1,
  enabled: true,
  apkUrl,
  qrImageUrl: qrUrl
});
const trigger = (page: Page) =>
  page.getByRole('button', { name: 'Скачать Android-приложение' });
const dialog = (page: Page) =>
  page.getByRole('dialog', { name: 'SEP Chat для Android' });

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: [] }));
  const image = await QRCode.toBuffer(landingUrl, { width: 696, margin: 4 });
  await page.route(qrUrl, route =>
    route.fulfill({
      contentType: 'image/png',
      headers: { 'access-control-allow-origin': '*' },
      body: image
    })
  );
});

for (const theme of ['light', 'dark']) {
  test(`QR скачивает публичную APK, узкий экран и тема ${theme}`, async ({
    page
  }, testInfo) => {
    let requests = 0;
    await page.route(configUrl, route => {
      requests++;
      expect(route.request().headers().authorization).toBeUndefined();
      expect(route.request().headers().cookie).toBeUndefined();
      return route.fulfill({ json: config() });
    });
    await page.setViewportSize({ width: 280, height: 740 });
    await page.goto(`/e2e/fixtures/profile-qr-login.html?theme=${theme}`);
    await expect(trigger(page)).toBeVisible();
    expect(requests).toBe(0);
    await trigger(page).click();
    await expect(dialog(page)).toBeVisible();
    const image = page.getByRole('img', {
      name: 'QR-код для скачивания SEP Chat на Android'
    });
    await expect(image).toBeVisible();
    expect(
      await page.evaluate(async () => {
        const path = '/e2e/fixtures/decode-profile-qr.ts';
        const { decodeProfileQr } = await import(/* @vite-ignore */ path);
        return decodeProfileQr('.profile-android__code img');
      })
    ).toBe(landingUrl);
    await expect(
      page.getByRole('link', { name: 'Скачать APK' })
    ).toHaveAttribute('href', latestApk);
    const box = (await dialog(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(12);
    expect(box.x + box.width).toBeLessThanOrEqual(268);
    await page.screenshot({
      path: testInfo.outputPath(`android-${theme}.png`)
    });
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
  });
}

test('новая ссылка берётся из Ketoy при открытии; ошибка и закрытие не показывают старую', async ({
  page
}) => {
  let mode = 0;
  const nextApk = 'https://downloads.example.test/SEP-Chat-next.apk';
  await page.route(configUrl, route => {
    if (mode === 1) return route.abort();
    if (mode === 3)
      return route.fulfill({ json: config('javascript:alert(1)') });
    return route.fulfill({ json: config(mode === 2 ? nextApk : latestApk) });
  });
  await page.goto('/e2e/fixtures/profile-qr-login.html');
  await trigger(page).click();
  await expect(page.getByRole('link', { name: 'Скачать APK' })).toHaveAttribute(
    'href',
    latestApk
  );
  await page.keyboard.press('Escape');
  mode = 1;
  await trigger(page).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Не удалось загрузить QR-код.'
  );
  await expect(page.getByRole('link', { name: 'Скачать APK' })).toHaveCount(0);
  mode = 2;
  await page.getByRole('button', { name: 'Попробовать снова' }).click();
  await expect(page.getByRole('link', { name: 'Скачать APK' })).toHaveAttribute(
    'href',
    nextApk
  );
  await page.keyboard.press('Escape');
  mode = 3;
  await trigger(page).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Скачать APK' })).toHaveCount(0);
  await page.evaluate(() => (window as any).profileQrFixture.leave());
  await expect(dialog(page)).toHaveCount(0);
});
