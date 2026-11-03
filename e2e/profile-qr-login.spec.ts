import { expect, test, type Page, type Route } from '@playwright/test';
import { createAndroidPerformanceServer } from './fixtures/android-performance-server';

const trigger = (page: Page) =>
  page.getByRole('button', { name: 'Вход по QR-коду' });
const popover = (page: Page) =>
  page.getByRole('dialog', { name: 'Вход по QR-коду' });
const image = (page: Page) =>
  page.getByRole('img', { name: 'QR-код для входа в чат' });
const decode = (page: Page): Promise<string> =>
  page.evaluate(async () => {
    const path = '/e2e/fixtures/decode-profile-qr.ts';
    const { decodeProfileQr } = await import(/* @vite-ignore */ path);
    return decodeProfileQr();
  });
const setToken = (page: Page, token: string) =>
  page.evaluate(
    token => (window as any).profileQrFixture.setToken(token),
    token
  );
const jwt = (
  label: string,
  expired = false,
  nowMs = Date.now(),
  lifetimeSeconds = 900
) => {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(nowMs / 1000);
  return [
    encode({ alg: expired ? 'HS256' : 'RS256', kid: 'test-key', typ: 'JWT' }),
    encode({
      sub: 'profile-qr-user',
      label,
      iat: now,
      exp: now + (expired ? -1 : lifetimeSeconds)
    }),
    'a'.repeat(342)
  ].join('.');
};
const qrCode = (index = 0) => 'A'.repeat(21) + String.fromCharCode(65 + index);
const fulfillQr = async (page: Page, route: Route, code = qrCode()) =>
  route.fulfill({
    json: {
      code,
      expires_at: new Date(
        (await page.evaluate(() => Date.now())) + 90_000
      ).toISOString()
    }
  });
const expectLoginUrl = (raw: string, apiOrigin: string, code = qrCode()) => {
  const url = new URL(raw);
  expect(url.origin).toBe(apiOrigin);
  expect(url.pathname).toBe('/api/v2/q');
  expect(url.search).toBe('');
  expect(url.hash).toBe(`#qr=${code}`);
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: [] }));
  await page.route('**/api/v2/auth/qr', route => fulfillQr(page, route));
});

test('QR содержит короткую ссылку сервера; окно в центре; повтор берёт текущий токен', async ({
  page
}, testInfo) => {
  const tokens: string[] = [];
  await page.route('**/api/v2/auth/qr', route => {
    tokens.push(route.request().headers().authorization);
    return fulfillQr(page, route, qrCode(tokens.length - 1));
  });
  await page.goto(
    '/e2e/fixtures/profile-qr-login.html?theme=light#old-fragment'
  );
  await expect(trigger(page)).toBeVisible();
  await trigger(page).click();
  await expect(image(page)).toBeVisible();
  expectLoginUrl(await decode(page), new URL(page.url()).origin);
  expect((await image(page).boundingBox())!.width).toBe(232);
  const box = (await popover(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(box.x + box.width / 2).toBeCloseTo(page.viewportSize()!.width / 2, 0);
  expect(box.y + box.height / 2).toBeCloseTo(
    page.viewportSize()!.height / 2,
    0
  );
  await page.screenshot({ path: testInfo.outputPath('profile-qr-login.png') });
  await page.keyboard.press('Escape');
  await expect(popover(page)).toHaveCount(0);
  await expect(trigger(page)).toBeFocused();
  await setToken(page, 'updated-profile-token');
  await page.evaluate(() => {
    document.cookie = 'authToken=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/';
  });
  await trigger(page).click();
  await expect(image(page)).toBeVisible();
  expectLoginUrl(await decode(page), new URL(page.url()).origin, qrCode(1));
  expect(tokens).toEqual([
    'Bearer profile-qr-test-token',
    'Bearer updated-profile-token'
  ]);
  await page.mouse.click(
    page.viewportSize()!.width - 1,
    page.viewportSize()!.height - 1
  );
  await expect(popover(page)).toHaveCount(0);
});

test('общий JWT передаётся только в Bearer при создании QR без refresh-cookie', async ({
  page
}) => {
  const requests: string[] = [];
  const token = jwt('current');
  await page.route('**/api/auth/**', route =>
    route.fulfill({
      status: 401,
      json: {
        message: 'Refresh-cookie чата не найдена',
        code: 'CHAT_REFRESH_MISSING'
      }
    })
  );
  await page.goto('/e2e/fixtures/profile-qr-login.html?theme=dark');
  await setToken(page, token);
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.includes('/auth/') || path.includes('/v2/')) requests.push(path);
  });
  await trigger(page).click();
  await expect(image(page)).toBeVisible();
  const raw = await decode(page);
  expectLoginUrl(raw, new URL(page.url()).origin);
  expect(raw).not.toContain(token);
  expect(requests).toEqual(['/api/v2/auth/qr']);
  await page.evaluate(() => (window as any).profileQrFixture.leave());
  await expect(popover(page)).toHaveCount(0);
});

test('просроченная сессия не попадает в QR; повтор берёт восстановленный токен', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/profile-qr-login.html');
  await setToken(page, jwt('expired', true));
  await trigger(page).click();
  await expect(popover(page).getByRole('alert')).toBeVisible();
  await expect(image(page)).toHaveCount(0);
  await setToken(page, 'restored-token');
  await page.getByRole('button', { name: 'Попробовать снова' }).click();
  await expect(image(page)).toBeVisible();
  expectLoginUrl(await decode(page), new URL(page.url()).origin);
});

for (const scenario of [
  'несколько дней простоя',
  'токен почти истёк',
  '401 от сервера'
]) {
  test(`QR использует обновлённую ERP-сессию: ${scenario}`, async ({
    page
  }) => {
    await page.clock.install();
    const initialTime = Date.now();
    const wakeTime =
      initialTime +
      (scenario === 'несколько дней простоя' ? 3 * 86_400_000 : 0);
    const oldToken = jwt(
      'old',
      false,
      initialTime,
      scenario === 'токен почти истёк' ? 60 : 900
    );
    const newToken = jwt('renewed', false, wakeTime);
    const requests: string[] = [];
    const tokens: string[] = [];
    page.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (path.includes('/auth/')) requests.push(path);
    });
    await page.route('**/erp/api/auth/refresh', route =>
      route.fulfill({ json: { token: newToken } })
    );
    await page.route('**/api/auth/session', route =>
      route.fulfill({
        json: { id: 'profile-qr-user', initials: 'Пупкин И.И.' }
      })
    );
    await page.route('**/api/v2/auth/qr', route => {
      tokens.push(route.request().headers().authorization);
      if (scenario === '401 от сервера' && tokens.length === 1)
        return route.fulfill({ status: 401, json: {} });
      return fulfillQr(page, route);
    });
    await page.goto('/e2e/fixtures/profile-qr-login.html');
    await page.evaluate(
      token =>
        (window as any).profileQrFixture.setToken(token, 'erp_bootstrap'),
      oldToken
    );
    // Меняем часы без запуска фоновых таймеров — как после сна компьютера.
    await page.clock.setSystemTime(wakeTime);
    await trigger(page).click();
    await expect(image(page)).toBeVisible();
    expectLoginUrl(await decode(page), new URL(page.url()).origin);
    expect(tokens).toEqual(
      scenario === '401 от сервера'
        ? [`Bearer ${oldToken}`, `Bearer ${newToken}`]
        : [`Bearer ${newToken}`]
    );
    expect(requests.filter(path => path.endsWith('/auth/refresh'))).toEqual([
      '/erp/api/auth/refresh'
    ]);
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('chat_auth_session') || '{}').token
      )
    ).toBe(newToken);
  });
}

test('ошибки создания не обновляют и не сбрасывают сессию; повтор восстанавливает QR', async ({
  page
}) => {
  const authRequests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.includes('/auth/'))
      authRequests.push(new URL(request.url()).pathname);
  });
  let attempts = 0;
  await page.route('**/api/v2/auth/qr', route => {
    attempts++;
    return attempts < 3
      ? route.fulfill({ status: attempts === 1 ? 401 : 503, json: {} })
      : fulfillQr(page, route);
  });
  await page.goto('/e2e/fixtures/profile-qr-login.html');
  await trigger(page).click();
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(popover(page).getByRole('alert')).toBeVisible();
    await expect(image(page)).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('chat_auth_session') || '{}').token
      )
    ).toBe('profile-qr-test-token');
    await page.getByRole('button', { name: 'Попробовать снова' }).click();
  }
  await expect(image(page)).toBeVisible();
  expect(authRequests).toEqual(Array(3).fill('/api/v2/auth/qr'));
});

test('просроченная сессия входа в чат обновляется через чат; отказ refresh сохраняет профиль', async ({
  page
}) => {
  await page.clock.install();
  const now = Date.now();
  const validToken = jwt('chat-renewed', false, now);
  const expiredSharedToken = jwt('chat-expired', false, now - 3 * 86_400_000);
  let refreshes = 0;
  await page.route('**/api/auth/refresh', route => {
    refreshes++;
    return refreshes === 1
      ? route.fulfill({
          json: {
            accessToken: validToken,
            user: { id: 'profile-qr-user', initials: 'Пупкин И.И.' }
          }
        })
      : route.fulfill({
          status: 401,
          json: { code: 'CHAT_REFRESH_MISSING' }
        });
  });
  const tokens: string[] = [];
  await page.route('**/api/v2/auth/qr', route => {
    tokens.push(route.request().headers().authorization);
    return fulfillQr(page, route);
  });
  await page.goto('/e2e/fixtures/profile-qr-login.html');
  await setToken(page, expiredSharedToken);
  await trigger(page).click();
  await expect(image(page)).toBeVisible();
  expect(tokens).toEqual([`Bearer ${validToken}`]);
  await page.keyboard.press('Escape');
  await setToken(page, expiredSharedToken);
  await trigger(page).click();
  await expect(popover(page).getByRole('alert')).toBeVisible();
  await expect(image(page)).toHaveCount(0);
  await expect(trigger(page)).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('chat_auth_session') || '{}').token
    )
  ).toBe(expiredSharedToken);
  expect(refreshes).toBe(2);
  expect(tokens).toHaveLength(1);
});

test('неверный код и истёкший ответ сервера не показываются', async ({
  page
}) => {
  const responses = [
    {
      code: 'bad-code',
      expires_at: new Date(Date.now() + 90_000).toISOString()
    },
    { code: qrCode(), expires_at: 'invalid-date' },
    { code: qrCode(), expires_at: new Date(Date.now() - 1_000).toISOString() }
  ];
  await page.route('**/api/v2/auth/qr', route =>
    route.fulfill({ json: responses.shift() })
  );
  await page.goto('/e2e/fixtures/profile-qr-login.html');
  await trigger(page).click();
  for (let attempt = 0; attempt < 3; attempt++) {
    await expect(popover(page).getByRole('alert')).toBeVisible();
    await expect(image(page)).toHaveCount(0);
    if (attempt < 2)
      await page.getByRole('button', { name: 'Попробовать снова' }).click();
  }
});

test('QR обновляется перед истечением, ошибка убирает старый код, закрытие останавливает таймер', async ({
  page
}) => {
  await page.clock.install();
  let requests = 0;
  await page.route('**/api/v2/auth/qr', route => {
    requests++;
    return requests === 3
      ? route.fulfill({ status: 503, json: {} })
      : fulfillQr(page, route, qrCode(requests - 1));
  });
  await page.goto('/e2e/fixtures/profile-qr-login.html');
  await trigger(page).click();
  await expect(image(page)).toBeVisible();
  const firstImage = await image(page).getAttribute('src');
  await page.clock.fastForward(80_000);
  await expect.poll(() => requests).toBe(2);
  await expect(image(page)).toBeVisible();
  await expect(image(page)).not.toHaveAttribute('src', firstImage!);
  expectLoginUrl(await decode(page), new URL(page.url()).origin, qrCode(1));
  await page.clock.fastForward(80_000);
  await expect(popover(page).getByRole('alert')).toBeVisible();
  await expect(image(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Попробовать снова' }).click();
  await expect(image(page)).toBeVisible();
  const beforeSleep = await image(page).getAttribute('src');
  const wakeTime = await page.evaluate(() => Date.now() + 3 * 86_400_000);
  await page.clock.setSystemTime(wakeTime);
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange'))
  );
  await expect.poll(() => requests).toBe(5);
  await expect(image(page)).toBeVisible();
  await expect(image(page)).not.toHaveAttribute('src', beforeSleep!);
  await page.keyboard.press('Escape');
  await page.clock.fastForward(90_000);
  expect(requests).toBe(5);
  await expect(popover(page)).toHaveCount(0);
});

test('ответ после закрытия не заменяет новый QR', async ({ page }) => {
  let releaseFirst!: () => void;
  const firstPending = new Promise<void>(resolve => (releaseFirst = resolve));
  let completeFirst!: () => void;
  const firstComplete = new Promise<void>(resolve => (completeFirst = resolve));
  let requests = 0;
  await page.route('**/api/v2/auth/qr', async route => {
    const index = requests++;
    if (index === 0) await firstPending;
    await fulfillQr(page, route, qrCode(index));
    if (index === 0) completeFirst();
  });
  await page.goto('/e2e/fixtures/profile-qr-login.html');
  await trigger(page).click();
  await expect.poll(() => requests).toBe(1);
  await page.keyboard.press('Escape');
  await trigger(page).click();
  await expect(image(page)).toBeVisible();
  expectLoginUrl(await decode(page), new URL(page.url()).origin, qrCode(1));
  const currentImage = await image(page).getAttribute('src');
  releaseFirst();
  await firstComplete;
  await expect(image(page)).toHaveAttribute('src', currentImage!);
});

test('кнопка доступна при ожидании сети; сворачивание закрывает окно', async ({
  page,
  isMobile
}) => {
  await page.goto('/e2e/fixtures/profile-qr-login.html');
  if (isMobile) {
    await expect(page.locator('.menu-section-heading__network')).toBeVisible({
      timeout: 15_000
    });
  }
  await trigger(page).click();
  await expect(image(page)).toBeVisible();
  await page.evaluate(() => (window as any).profileQrFixture.collapse());
  await expect(popover(page)).toHaveCount(0);
});

test('корпоративная сессия → короткий QR профиля → одноразовый вход в новом браузере', async ({
  page,
  browser
}, testInfo) => {
  const webOrigin = new URL(testInfo.project.use.baseURL!).origin;
  const fixture = await createAndroidPerformanceServer({
    port: 5480 + testInfo.parallelIndex,
    topicCount: 1,
    messagesPerTopic: 2,
    userCount: 2,
    qrRedirectUrl: webOrigin
  });
  const token = 'synthetic-corporate-session';
  const v2Requests: string[] = [];
  const authRequests: string[] = [];
  let used = false;
  const routeAuth = async (target: Page) => {
    await target.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', {
        configurable: true,
        value: true
      });
    });
    target.on('request', request => {
      if (new URL(request.url()).pathname.includes('/v2/'))
        v2Requests.push(request.url());
    });
    await target.route('**/api/auth/session', route => {
      authRequests.push(route.request().headers().authorization);
      return route.fulfill({ json: fixture.user });
    });
    await target.route('**/api/v2/auth/qr', route => {
      expect(route.request().method()).toBe('POST');
      expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
      return fulfillQr(target, route);
    });
    await target.route('**/api/v2/auth/qr/exchange', route => {
      expect(route.request().postDataJSON()).toEqual({ code: qrCode() });
      if (used) return route.fulfill({ status: 401, json: {} });
      used = true;
      return route.fulfill({ json: { token, organization: fixture.origin } });
    });
    await target.route('**/manager/access', route =>
      route.fulfill({ json: { allowed: true } })
    );
    await target.addLocatorHandler(
      target.getByRole('button', { name: 'Настроить позже' }),
      locator =>
        locator.evaluate(button => (button as HTMLButtonElement).click()),
      { times: 1, noWaitAfter: true }
    );
  };
  const recipientContext = await browser.newContext();
  try {
    await page.unroute('**/api/**');
    await routeAuth(page);
    await page.goto(
      `/?token=${token}&organization=${encodeURIComponent(fixture.origin)}`
    );
    await expect(
      page.locator('[data-testid$="-MenuBottomNav-Profile"]:visible')
    ).toBeVisible({ timeout: 30_000 });
    await page
      .locator('[data-testid$="-MenuBottomNav-Profile"]:visible')
      .click();
    await expect(trigger(page)).toBeVisible({ timeout: 15_000 });
    await trigger(page).click();
    await expect(image(page)).toBeVisible();
    const qrUrl = await decode(page);
    expectLoginUrl(qrUrl, fixture.origin);
    expect(qrUrl).not.toContain(token);
    const recipient = await recipientContext.newPage();
    await routeAuth(recipient);
    await recipient.goto(qrUrl);
    await expect
      .poll(
        () =>
          recipient.evaluate(
            () =>
              JSON.parse(localStorage.getItem('chat_auth_session') || '{}')
                .token
          ),
        { timeout: 30_000 }
      )
      .toBe(token);
    await expect(
      recipient.locator('[data-testid$="-MenuBottomNav-Profile"]:visible')
    ).toBeVisible({ timeout: 30_000 });
    expect(new URL(recipient.url()).hash).toBe('');
    expect(
      await recipient.evaluate(() =>
        localStorage.getItem('chat_runtime_last_organization')
      )
    ).toBe(fixture.origin);
    expect(authRequests).toEqual([`Bearer ${token}`, `Bearer ${token}`]);
    expect(v2Requests.map(url => new URL(url).pathname)).toEqual([
      '/api/v2/auth/qr',
      '/api/v2/q',
      '/api/v2/auth/qr/exchange'
    ]);
  } finally {
    await recipientContext.close();
    await fixture.close();
  }
});
