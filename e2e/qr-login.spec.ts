import { expect, test } from '@playwright/test';
import { createAndroidPerformanceServer } from './fixtures/android-performance-server';

test('короткий QR открывает чат через одноразовый обмен и очищает fragment', async ({
  page
}, testInfo) => {
  const fixture = await createAndroidPerformanceServer({
    port: 5480 + testInfo.parallelIndex,
    topicCount: 1,
    messagesPerTopic: 2,
    userCount: 2
  });
  const code = 'A'.repeat(22);
  const exchanges: unknown[] = [];

  try {
    // Короткая ссылка возвращает исходный ERP-токен: затем работает прежняя проверка.
    await page.route('**/api/auth/session', route =>
      route.fulfill({ json: fixture.user })
    );
    await page.route('**/api/v2/auth/qr/exchange', async route => {
      exchanges.push(route.request().postDataJSON());
      await route.fulfill({
        json: {
          token: 'synthetic-qr-session',
          organization: fixture.origin
        }
      });
    });
    await page.goto(
      `/?organization=${encodeURIComponent(fixture.origin)}#qr=${code}`
    );
    await expect.poll(() => exchanges.length).toBe(1);
    await expect
      .poll(() =>
        fixture.requests.some(request => request.path.startsWith('/api/topics'))
      )
      .toBe(true);
    expect(exchanges).toEqual([{ code }]);
    expect(new URL(page.url()).hash).toBe('');
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('chat_auth_session') || '{}')
    );
    expect(saved.token).toBe('synthetic-qr-session');
    expect(JSON.stringify(saved)).not.toContain(code);
  } finally {
    await fixture.close();
  }
});

test('истёкший QR не открывает чат и предлагает сканировать новый', async ({
  page
}, testInfo) => {
  const fixture = await createAndroidPerformanceServer({
    port: 5480 + testInfo.parallelIndex,
    topicCount: 1,
    messagesPerTopic: 2,
    userCount: 2
  });

  try {
    await page.route('**/api/v2/auth/qr/exchange', route =>
      route.fulfill({ status: 401, json: { message: 'unauthorized' } })
    );
    await page.goto(
      `/?organization=${encodeURIComponent(fixture.origin)}#qr=${'B'.repeat(22)}`
    );
    await expect(page.getByTestId('AuthorizationScreen')).toBeVisible();
    await expect(
      page.getByText(/Не удалось войти по QR-коду/).first()
    ).toBeVisible();
    expect(
      fixture.requests.some(request => request.path.startsWith('/api/topics'))
    ).toBe(false);
    expect(
      await page.evaluate(() => localStorage.getItem('chat_auth_session'))
    ).toBeNull();
  } finally {
    await fixture.close();
  }
});
