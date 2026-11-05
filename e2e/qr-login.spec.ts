import { expect, test } from '@playwright/test';
import type { Route } from '@playwright/test';
import { createAndroidPerformanceServer } from './fixtures/android-performance-server';

const fulfillAuth = (
  route: Route,
  response: Parameters<Route['fulfill']>[0]
) => {
  const headers = {
    'Access-Control-Allow-Origin':
      route.request().headers().origin || 'http://localhost:5173',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
  return route.fulfill(
    route.request().method() === 'OPTIONS'
      ? { status: 204, headers }
      : { ...response, headers: { ...headers, ...response?.headers } }
  );
};

for (const format of ['token', 'short'] as const) {
  for (const status of [401, 503]) {
    test(`${format} QR: отказ обмена ${status} возвращает сканирование без кратковременного входа`, async ({
      page
    }, testInfo) => {
      const fixture = await createAndroidPerformanceServer({
        port: 5520 + testInfo.parallelIndex,
        topicCount: 1,
        messagesPerTopic: 2,
        userCount: 2
      });
      const encode = (value: object) =>
        Buffer.from(JSON.stringify(value)).toString('base64url');
      const token = `${encode({ alg: 'RS256', kid: 'test-key' })}.${encode({ exp: Math.floor(Date.now() / 1000) + 900 })}.computer`;
      try {
        await page.route('**/api/v2/auth/qr/exchange', route =>
          fulfillAuth(route, { json: { token } })
        );
        await page.route('**/api/auth/qr-login', route =>
          fulfillAuth(route, {
            status,
            json: {
              code: status === 401 ? 'AUTH_INACTIVE' : 'AUTH_UNAVAILABLE'
            }
          })
        );
        const organization = encodeURIComponent(fixture.origin);
        await page.goto(
          format === 'token'
            ? `/?organization=${organization}&token=${encodeURIComponent(token)}`
            : `/?organization=${organization}#qr=${'A'.repeat(22)}`
        );
        await expect(page.getByTestId('AuthorizationScreen')).toBeVisible({
          timeout: 30_000
        });
        await expect(
          page.getByText(/Не удалось войти по QR-коду/).first()
        ).toBeVisible();
        expect(
          await page.evaluate(() => localStorage.getItem('chat_auth_session'))
        ).toBeNull();
        expect(
          fixture.requests.some(request =>
            request.path.startsWith('/api/topics')
          )
        ).toBe(false);
      } finally {
        await fixture.close();
      }
    });
  }
  test(`общий access из ${format} QR становится отдельной сессией и не обменивается повторно при перезапуске`, async ({
    page
  }, testInfo) => {
    const fixture = await createAndroidPerformanceServer({
      port: 5500 + testInfo.parallelIndex,
      topicCount: 1,
      messagesPerTopic: 2,
      userCount: 2
    });
    const encode = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const token = (signature: string) =>
      [
        encode({ alg: 'RS256', kid: 'test-key' }),
        encode({ sub: '42', iat: now, exp: now + 900 }),
        signature
      ].join('.');
    const source = token('computer');
    const phone = token('phone');
    let exchanges = 0;
    const authRequests: string[] = [];
    try {
      await page.route('**/api/v2/auth/qr/exchange', route =>
        fulfillAuth(route, { json: { token: source } })
      );
      await page.route('**/api/auth/qr-login', route => {
        if (route.request().method() === 'OPTIONS')
          return fulfillAuth(route, {});
        exchanges++;
        expect(route.request().headers().authorization).toBe(
          `Bearer ${source}`
        );
        return fulfillAuth(route, {
          json: {
            token: phone,
            user: fixture.user,
            expireTimeSeconds: 900,
            source: 'chat_qr'
          },
          headers: {
            'Set-Cookie':
              'chat_refresh_token=synthetic-phone; Path=/api/auth; HttpOnly; SameSite=Lax'
          }
        });
      });
      page.on('request', request => {
        if (new URL(request.url()).pathname.endsWith('/api/topics'))
          authRequests.push(request.headers().authorization || '');
      });
      const organization = encodeURIComponent(fixture.origin);
      await page.goto(
        format === 'token'
          ? `/?organization=${organization}&token=${encodeURIComponent(source)}`
          : `/?organization=${organization}#qr=${'A'.repeat(22)}`
      );
      await expect
        .poll(
          () =>
            page.evaluate(() =>
              JSON.parse(localStorage.getItem('chat_auth_session') || '{}')
            ),
          { timeout: 30_000 }
        )
        .toMatchObject({
          token: phone,
          source: 'chat_qr',
          user: { id: fixture.user.id }
        });
      await expect.poll(() => authRequests.length).toBeGreaterThan(0);
      expect(
        authRequests.every(authorization => authorization === `Bearer ${phone}`)
      ).toBe(true);
      await expect
        .poll(() => new URL(page.url()).searchParams.has('token'))
        .toBe(false);
      await page.reload();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              JSON.parse(localStorage.getItem('chat_auth_session') || '{}')
                .token
          )
        )
        .toBe(phone);
      expect(exchanges).toBe(1);
      expect(
        await page.evaluate(() => localStorage.getItem('erp_bootstrap_token'))
      ).toBeNull();
      expect(
        await page.evaluate(() =>
          localStorage.getItem('chat_qr_bootstrap_source')
        )
      ).toBeNull();
    } finally {
      await fixture.close();
    }
  });
}

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
      fulfillAuth(route, { json: fixture.user })
    );
    await page.route('**/api/v2/auth/qr/exchange', async route => {
      if (route.request().method() === 'OPTIONS') return fulfillAuth(route, {});
      exchanges.push(route.request().postDataJSON());
      await fulfillAuth(route, {
        json: {
          token: 'synthetic-qr-session',
          organization: fixture.origin
        }
      });
    });
    await page.goto(
      `/?organization=${encodeURIComponent(fixture.origin)}#qr=${code}`
    );
    await expect.poll(() => exchanges.length, { timeout: 30_000 }).toBe(1);
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
      fulfillAuth(route, { status: 401, json: { message: 'unauthorized' } })
    );
    await page.goto(
      `/?organization=${encodeURIComponent(fixture.origin)}#qr=${'B'.repeat(22)}`
    );
    await expect(page.getByTestId('AuthorizationScreen')).toBeVisible({
      timeout: 30_000
    });
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
