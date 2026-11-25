import { expect, test } from '@playwright/test';
test.setTimeout(90_000);

for (const [status, body, message] of [
  [404, '', 'Сервер по этой ссылке не найден. Проверьте адрес.'],
  [200, '<!doctype html><title>Другой сайт</title>', 'Сервер по этой ссылке не найден. Проверьте адрес.'],
  [503, '', 'Сервер временно недоступен. Попробуйте позже.']
] as const) {
  test(`ошибка сервера ${status} не сохраняет неверную организацию`, async ({ page }) => {
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'missing.fixture.invalid') return route.fulfill({
        status, body, headers: { 'Access-Control-Allow-Origin': '*' }
      });
      return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.fallback() : route.abort();
    });
    await page.goto('/');
    await expect(page.getByTestId('AuthorizationScreen')).toBeVisible({ timeout: 30_000 });
    await page.getByPlaceholder('Введите ссылку').fill('https://missing.fixture.invalid');
    await page.getByRole('button', { name: 'Далее', exact: true }).click();
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('chat_runtime_organizations'))).toBeNull();
    await expect(page.getByPlaceholder('Введите ссылку')).toHaveValue('https://missing.fixture.invalid');
  });
}
