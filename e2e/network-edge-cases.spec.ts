import { expect, test, type Page } from '@playwright/test';
import { openFixture } from './fixtures/topic-performance-page';

test.setTimeout(90_000);

async function mountUpdates(page: Page) {
  await page.evaluate(async () => {
    const path = '/e2e/fixtures/network-harness.ts';
    const fixture = await import(/* @vite-ignore */ path);
    (window as any).networkUpdates = fixture.mountUpdates();
    (window as any).topicPerformance.sdk.isConnected = () => true;
  });
}

test('восстановление сети не ждёт Socket.IO backoff и не дублирует попытки', async ({
  page
}) => {
  await openFixture(page);

  const result = await page.evaluate(async () => {
    const path = '/src/services/useChatSDK/index.ts';
    const { ChatSDK } = await import(/* @vite-ignore */ path);
    return [false, true].map(connected => {
      const sdk = new ChatSDK({
        apiUrl: `${location.origin}/performance-api`,
        wsUrl: 'ws://chat.example.test',
        token: 'test-token'
      });
      let disconnects = 0;
      let connects = 0;

      (sdk as any).socket = {
        connected,
        disconnect: () => {
          disconnects++;
        },
        connect: () => {
          connects++;
        }
      };

      sdk.reconnectImmediatelyAfterNetworkRestore();
      sdk.reconnectImmediatelyAfterNetworkRestore();

      return { disconnects, connects };
    });
  });

  expect(result).toEqual([
    { disconnects: 1, connects: 1 },
    { disconnects: 1, connects: 1 }
  ]);
});

test('ожидание сети появляется сразу и сохраняется при устаревшем состоянии сокета', async ({
  page,
  context
}) => {
  await page.clock.install();
  await openFixture(page);
  await page.evaluate(async () => {
    const path = '/e2e/fixtures/network-harness.ts';
    const fixture = await import(/* @vite-ignore */ path);
    (window as any).networkFixture = fixture;
    (window as any).networkConnection = fixture.controlConnection();
    (window as any).connectionProfile = fixture.mountConnectionProfile();
  });
  const profile = page.getByTestId('NetworkProfile-UserProfile-Container');
  await expect(profile.locator('.connection-status')).toHaveCount(0);
  await page.clock.pauseAt(Date.now() + 1000);
  await context.setOffline(true);

  const states = await page.evaluate(async () => {
    const { getHasWebsocketConnection, nextTick } = (window as any)
      .networkFixture;
    await nextTick();
    const status = () => ({
      connected: getHasWebsocketConnection(),
      text: document
        .querySelector(
          '[data-testid="NetworkProfile-UserProfile-Container"] .connection-status'
        )
        ?.textContent?.trim()
    });
    const beforeFocus = status();
    window.dispatchEvent(new Event('focus'));
    await nextTick();
    return [beforeFocus, status()];
  });
  expect(states).toEqual([
    { connected: false, text: 'Ожидание сети' },
    { connected: false, text: 'Ожидание сети' }
  ]);
  await page.clock.runFor(1200);
  await expect(profile.locator('.connection-status')).toHaveText(
    'Ожидание сети'
  );
  await page.clock.runFor(9000);
  await expect(profile.locator('.connection-status')).toHaveText('Нет сети');

  await context.setOffline(false);
  await page.evaluate(() => {
    const sdk = (window as any).topicPerformance.sdk;
    sdk.emitConnectionState(true);
  });
  await expect(profile.locator('.connection-status')).toHaveCount(0);
  await context.setOffline(true);
  await expect(profile.locator('.connection-status')).toHaveText(
    'Ожидание сети'
  );
  await context.setOffline(false);
});

for (const failure of ['error', 'timeout'] as const) {
  test(`потеря связи без offline обнаруживается быстро (${failure})`, async ({
    page
  }) => {
    let unavailable = false;
    let requests = 0;
    let release!: () => void;
    const stalled = new Promise<void>(resolve => {
      release = resolve;
    });
    await openFixture(page);
    await page.route('**/live-health*', async route => {
      requests++;
      if (unavailable && failure === 'error') return route.abort();
      if (unavailable) await stalled;
      await route.fulfill({ json: { status: 'ok' } }).catch(() => {});
    });
    await page.evaluate(async () => {
      const path = '/e2e/fixtures/network-harness.ts';
      const fixture = await import(/* @vite-ignore */ path);
      (window as any).networkFixture = fixture;
      (window as any).networkConnection = fixture.controlConnection();
      (window as any).connectionProfile = fixture.mountConnectionProfile();
    });
    const profile = page.getByTestId('NetworkProfile-UserProfile-Container');
    await expect.poll(() => requests).toBeGreaterThan(0);
    await expect(profile.locator('.connection-status')).toHaveCount(0);

    const startedAt = Date.now();
    unavailable = true;
    await expect(profile.locator('.connection-status')).toHaveText(
      'Ожидание сети',
      { timeout: 3000 }
    );
    expect(Date.now() - startedAt).toBeLessThan(3000);
    expect(
      await page.evaluate(() => ({
        browserOnline: navigator.onLine,
        socketConnected: (window as any).topicPerformance.sdk.isConnected()
      }))
    ).toEqual({ browserOnline: true, socketConnected: true });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(profile.locator('.connection-status')).toHaveText(
      'Ожидание сети'
    );

    unavailable = false;
    release();
    await expect(profile.locator('.connection-status')).toHaveCount(0);
    expect(
      await page.evaluate(
        () => (window as any).networkConnection.calls.disconnect
      )
    ).toBe(1);
  });
}

test('offline в нативном приложении сразу показывает ожидание сети', async ({
  page,
  context
}) => {
  await openFixture(page);
  await page.evaluate(async () => {
    const path = '/e2e/fixtures/network-harness.ts';
    const fixture = await import(/* @vite-ignore */ path);
    (window as any).networkFixture = fixture;
    (window as any).networkConnection = fixture.controlConnection();
    (window as any).connectionProfile = fixture.mountConnectionProfile();
    fixture.Capacitor.isNativePlatform = () => true;
  });
  const profile = page.getByTestId('NetworkProfile-UserProfile-Container');
  await expect(profile.locator('.connection-status')).toHaveCount(0);
  await context.setOffline(true);

  const status = await page.evaluate(async () => {
    const fixture = (window as any).networkFixture;
    window.dispatchEvent(new Event('focus'));
    await fixture.nextTick();
    return {
      connected: fixture.getHasWebsocketConnection(),
      text: document
        .querySelector(
          '[data-testid="NetworkProfile-UserProfile-Container"] .connection-status'
        )
        ?.textContent?.trim()
    };
  });
  expect(status).toEqual({ connected: false, text: 'Ожидание сети' });
});

const visibility = (page: Page, value: string) =>
  page.evaluate(value => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, value);

test('разные поиски, страницы и SDK не смешивают ответы; завершённый GET повторяется', async ({
  page
}) => {
  await openFixture(page);
  const calls: string[] = [];
  await page.route('**/performance-api/users?*', async route => {
    const url = new URL(route.request().url());
    const key = `${url.search}|${route.request().headers().authorization}`;
    calls.push(key);
    await new Promise(resolve => setTimeout(resolve, 150));
    await route.fulfill({ json: { data: [{ id: key }] } });
  });
  const result = await page.evaluate(async () => {
    const path = '/src/services/useChatSDK/index.ts';
    const { ChatSDK } = await import(/* @vite-ignore */ path);
    const { sdk } = (window as any).topicPerformance;
    const second = new ChatSDK({
      apiUrl: `${location.origin}/performance-api`,
      wsUrl: '',
      token: 'second-session'
    });
    const responses = await Promise.all([
      sdk.getUsers({ search: 'A', page: 1 }),
      sdk.getUsers({ search: 'B', page: 1 }),
      sdk.getUsers({ search: 'A', page: 2 }),
      second.getUsers({ search: 'A', page: 1 })
    ]);
    const repeated = await sdk.getUsers({ search: 'A', page: 1 });
    return {
      ids: responses.map(result => result.data[0].id),
      repeated: repeated.data[0].id
    };
  });
  expect(calls).toHaveLength(5);
  expect(new Set(result.ids).size).toBe(4);
  expect(result.repeated).toBe(result.ids[0]);
});

test('смена токена во время чтения начинает запрос в новой сессии', async ({
  page
}) => {
  await openFixture(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const tokens: string[] = [];
  await page.route('**/performance-api/users/performance-user', async route => {
    const token = route.request().headers().authorization;
    tokens.push(token);
    if (tokens.length === 1) await gate;
    await route.fulfill({ json: { id: token } });
  });
  await page.evaluate(() => {
    (window as any).oldRead = (
      window as any
    ).topicPerformance.sdk.getUserProfile('performance-user');
  });
  await expect.poll(() => tokens.length).toBe(1);
  const fresh = await page.evaluate(async () => {
    const path = '/src/composables/useLogin.ts';
    const { setAuthToken } = await import(/* @vite-ignore */ path);
    setAuthToken('new-session');
    return (window as any).topicPerformance.sdk.getUserProfile(
      'performance-user'
    );
  });
  release();
  const old = await page.evaluate(() => (window as any).oldRead);
  expect(tokens).toEqual(['Bearer performance-test', 'Bearer new-session']);
  expect(old.id).toBe('Bearer performance-test');
  expect(fresh.id).toBe('Bearer new-session');
});

test('общая ошибка не блокирует повторную попытку загрузки', async ({
  page
}) => {
  await openFixture(page);
  let requests = 0;
  await page.route('**/performance-api/users?*', async route => {
    requests++;
    await new Promise(resolve => setTimeout(resolve, 200));
    await route.fulfill(
      requests === 1
        ? { status: 503, json: { message: 'temporary unavailable' } }
        : { json: { data: [{ id: 'recovered' }] } }
    );
  });
  const result = await page.evaluate(async () => {
    const { sdk } = (window as any).topicPerformance;
    const first = await Promise.allSettled(
      Array.from({ length: 100 }, () => sdk.getUsers({ page: 1 }))
    );
    const second = await sdk.getUsers({ page: 1 });
    return {
      failed: first.filter(result => result.status === 'rejected').length,
      data: second.data
    };
  });
  expect(result).toEqual({ failed: 100, data: [{ id: 'recovered' }] });
  expect(requests).toBe(2);
});

test('редактирование профиля во время GET не возвращает старый ответ следующему читателю', async ({
  page
}) => {
  await openFixture(page);
  let releaseOld!: () => void;
  let releaseFresh!: () => void;
  const oldGate = new Promise<void>(resolve => {
    releaseOld = resolve;
  });
  const freshGate = new Promise<void>(resolve => {
    releaseFresh = resolve;
  });
  let reads = 0;
  let name = 'До изменения';
  await page.route('**/performance-api/users/performance-user', async route => {
    const current = ++reads;
    const snapshot = name;
    await (current === 1 ? oldGate : freshGate);
    await route.fulfill({ json: { id: 'performance-user', name: snapshot } });
  });
  await page.route('**/performance-api/users', async route => {
    expect(route.request().method()).toBe('PATCH');
    name = route.request().postDataJSON().name;
    await route.fulfill({ json: { id: 'performance-user', name } });
  });
  await page.evaluate(() => {
    (window as any).oldRead = (
      window as any
    ).topicPerformance.sdk.getUserProfile('performance-user');
  });
  await expect.poll(() => reads).toBe(1);
  await page.evaluate(async () => {
    const { sdk } = (window as any).topicPerformance;
    await sdk.updateUserProfile('performance-user', {
      name: 'После изменения'
    });
    (window as any).freshRead = sdk.getUserProfile('performance-user');
  });
  await expect.poll(() => reads).toBe(2);
  releaseOld();
  expect((await page.evaluate(() => (window as any).oldRead)).name).toBe(
    'До изменения'
  );
  await page.evaluate(() => {
    (window as any).joinedRead = (
      window as any
    ).topicPerformance.sdk.getUserProfile('performance-user');
  });
  releaseFresh();
  expect(
    await page.evaluate(async () =>
      (
        await Promise.all([
          (window as any).freshRead,
          (window as any).joinedRead
        ])
      ).map(value => value.name)
    )
  ).toEqual(['После изменения', 'После изменения']);
  expect(reads).toBe(2);
});

test('автопроверка обновления молчит в скрытой вкладке и офлайн, затем обнаруживает новую версию', async ({
  page
}) => {
  await page.clock.install();
  await openFixture(page);
  let requests = 0;
  await page.route('**/web-update.json*', route => {
    requests++;
    return route.fulfill({ json: { version: requests } });
  });
  await mountUpdates(page);
  await expect.poll(() => requests).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).networkUpdates.updates.hasCheckedForUpdates.value
      )
    )
    .toBe(true);
  await page.clock.pauseAt(Date.now() + 1000);
  await visibility(page, 'hidden');
  await page.clock.fastForward(180_000);
  expect(requests).toBe(1);
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false
    })
  );
  await visibility(page, 'visible');
  await page.clock.fastForward(120_000);
  expect(requests).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true
    });
    window.dispatchEvent(new Event('online'));
  });
  await expect.poll(() => requests).toBe(2);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).networkUpdates.updates.showUpdateBanner.value
      )
    )
    .toBe(true);
  await page.evaluate(() =>
    (window as any).networkUpdates.updates.checkForUpdates()
  );
  expect(requests).toBe(3);
});

test('кнопка веб-обновления перезагружает страницу без загрузки чанка звонков', async ({
  page
}) => {
  await openFixture(page);
  let version = 1;
  let blockedLiveKitRequests = 0;
  await page.route('**/web-update.json*', route =>
    route.fulfill({ json: { version } })
  );
  await page.route('**/src/services/useLiveKit.ts*', route => {
    blockedLiveKitRequests++;
    return route.abort();
  });
  await mountUpdates(page);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).networkUpdates.updates.hasCheckedForUpdates.value
      )
    )
    .toBe(true);

  version = 2;
  await page.evaluate(() =>
    (window as any).networkUpdates.updates.checkForUpdates()
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).networkUpdates.updates.showUpdateBanner.value
      )
    )
    .toBe(true);

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.evaluate(() => {
      void (window as any).networkUpdates.updates.handleUpdateClick();
    })
  ]);

  expect(page.url()).toContain('/__topic-performance');
  expect(blockedLiveKitRequests).toBe(0);
});

test('закрытие последнего компонента во время запроса не оставляет таймер обновлений', async ({
  page
}) => {
  await page.clock.install();
  await openFixture(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let requests = 0;
  await page.route('**/web-update.json*', async route => {
    requests++;
    await gate;
    await route.fulfill({ json: { version: 1 } });
  });
  await mountUpdates(page);
  await expect.poll(() => requests).toBe(1);
  await page.evaluate(() => (window as any).networkUpdates.app.unmount());
  release();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).networkUpdates.updates.hasCheckedForUpdates.value
      )
    )
    .toBe(true);
  await page.clock.pauseAt(Date.now() + 1000);
  await page.clock.fastForward(180_000);
  await visibility(page, 'hidden');
  await visibility(page, 'visible');
  await page.waitForTimeout(200);
  expect(requests).toBe(1);
  await mountUpdates(page);
  await expect.poll(() => requests).toBe(2);
});
