import { expect, test, type Page } from '@playwright/test';

async function openNativePushFixture(
  page: Page,
  savedTokens = false,
  hangRegistration = false
) {
  const requests: { platform: string; token: string; delivered: boolean }[] =
    [];
  let connected = false;
  await page.addInitScript(
    ({ savedTokens, hangRegistration }) => {
      localStorage.setItem(
        'chat_auth_session',
        JSON.stringify({
          token: 'isolated-native-push-session',
          user: { id: 'push-user' }
        })
      );
      if (savedTokens) {
        localStorage.setItem('chat_native_push_token', 'fcm-token');
        localStorage.setItem('chat_rustore_push_token', 'rustore-token');
      }
      const fixture = ((window as any).nativePushFixture = {
        listeners: {} as Record<string, (value: any) => void>,
        aborted: 0
      });
      if (hangRegistration) {
        const fetch = window.fetch.bind(window);
        const stalled = new Set<string>();
        window.fetch = async (input, init) => {
          const request = new Request(input, init);
          if (request.url.endsWith('/notifications/device')) {
            const { platform } = await request.clone().json();
            if (!stalled.has(platform)) {
              stalled.add(platform);
              return new Promise<Response>((_, reject) => {
                const abort = () => {
                  fixture.aborted++;
                  reject(new DOMException('Запрос отменён', 'AbortError'));
                };
                if (request.signal.aborted) abort();
                else
                  request.signal.addEventListener('abort', abort, {
                    once: true
                  });
              });
            }
          }
          return fetch(request);
        };
      }
      (window as any).androidBridge = {};
      (window as any).Capacitor = {
        PluginHeaders: [
          'PushNotifications',
          'RuStorePush',
          'NotificationTap',
          'TelemetryDevice'
        ].map(name => ({
          name,
          methods: [
            ...[
              'register',
              'checkPermissions',
              'consumePendingNotificationTap',
              'removeAllListeners',
              'removeListener'
            ].map(name => ({ name, rtype: 'promise' })),
            { name: 'addListener' }
          ]
        })),
        async nativePromise(plugin: string, method: string) {
          if (method === 'checkPermissions') return { receive: 'granted' };
          if (method === 'register') {
            if (savedTokens)
              throw new Error('SDK провайдера временно недоступен');
            if (plugin === 'PushNotifications')
              fixture.listeners['PushNotifications.registration']?.({
                value: 'fcm-token'
              });
            return plugin === 'RuStorePush' ? { value: 'rustore-token' } : {};
          }
          return {};
        },
        nativeCallback(
          plugin: string,
          method: string,
          options: any,
          callback: (value: any) => void
        ) {
          if (method === 'addListener')
            fixture.listeners[`${plugin}.${options.eventName}`] = callback;
          return options.eventName;
        }
      };
    },
    { savedTokens, hangRegistration }
  );
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname))
      return route.abort();
    if (url.pathname === '/__native-push-recovery')
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><div id="app"></div>'
      });
    if (url.pathname === '/native-push-api/notifications/device') {
      const payload = route.request().postDataJSON();
      requests.push({ ...payload, delivered: connected });
      return route.fulfill({
        status: connected ? 200 : 503,
        json: connected ? true : { message: 'Временно нет связи' }
      });
    }
    if (url.pathname.startsWith('/native-push-api/'))
      return route.fulfill({ json: [] });
    return route.fallback();
  });
  await page.goto('/__native-push-recovery');
  await page.evaluate(async () => {
    const { setConfig } = await import('/src/services/useConfig.ts');
    setConfig({ CHAT_API_DOMAIN: `${location.origin}/native-push-api` });
    const push = await import('/src/services/usePushNotifications.ts');
    await push.initPushNotifications();
  });
  return {
    requests,
    restore: () => {
      connected = true;
    }
  };
}

for (const event of ['browser-online', 'native-network']) {
  test(`повторяет обе неудачные регистрации после ${event}`, async ({
    page
  }) => {
    test.setTimeout(90_000);
    const fixture = await openNativePushFixture(page);
    await expect.poll(() => fixture.requests.length).toBeGreaterThanOrEqual(2);
    fixture.restore();
    await page.evaluate(event => {
      for (let i = 0; i < 3; i++) {
        if (event === 'browser-online')
          window.dispatchEvent(new Event('online'));
        else
          (window as any).nativePushFixture.listeners[
            'TelemetryDevice.networkStatusChange'
          ]({
            networkConnected: true,
            networkValidated: true
          });
      }
    }, event);
    await expect
      .poll(() =>
        fixture.requests
          .filter(r => r.delivered)
          .map(r => r.platform)
          .sort()
      )
      .toEqual(['android', 'rustore']);
    expect(
      fixture.requests
        .filter(r => r.delivered)
        .map(r => r.token)
        .sort()
    ).toEqual(['fcm-token', 'rustore-token']);
  });
}

test('после перезапуска восстанавливает сохранённые токены при недоступном SDK провайдеров', async ({
  page
}) => {
  test.setTimeout(90_000);
  const fixture = await openNativePushFixture(page, true);
  await expect.poll(() => fixture.requests.length).toBeGreaterThanOrEqual(2);
  fixture.restore();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect
    .poll(() =>
      fixture.requests
        .filter(r => r.delivered)
        .map(r => r.platform)
        .sort()
    )
    .toEqual(['android', 'rustore']);
});

test('зависшие запросы регистрации отменяются и повторяются после восстановления сети', async ({
  page
}) => {
  test.setTimeout(90_000);
  const fixture = await openNativePushFixture(page, true, true);
  fixture.restore();
  await expect
    .poll(
      () => page.evaluate(() => (window as any).nativePushFixture.aborted),
      {
        timeout: 20_000
      }
    )
    .toBe(2);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect
    .poll(() =>
      fixture.requests
        .filter(r => r.delivered)
        .map(r => r.platform)
        .sort()
    )
    .toEqual(['android', 'rustore']);
});
