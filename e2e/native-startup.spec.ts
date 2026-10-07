import { expect, test } from '@playwright/test';

for (const scenario of ['prepared', 'stalled'] as const) {
  test(`Android не ждёт зависший запрос стартовой истории: ${scenario}`, async ({
    page
  }) => {
    await page.route('**/__native-history', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><div id="app"></div>'
      })
    );
    await page.goto('/__native-history');
    const result = await page.evaluate(async scenario => {
      (window as any).androidBridge = {};
      (window as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android'
      };
      const { setConfig, setAuthUser, takeNativeStartupHistory } = await import(
        '/e2e/fixtures/native-startup-history-harness.ts'
      );
      setConfig({ CHAT_API_DOMAIN: 'http://localhost:5194/api' });
      setAuthUser({ id: 'cached-user' });
      const data = [{ id: 'cached-topic' }];
      window.__chatNativePreparedHistory =
        scenario === 'stalled'
          ? new Promise(() => {})
          : Promise.resolve({
              available: true,
              userId: 'cached-user',
              apiUrl: 'http://localhost:5194/api',
              topicId: '',
              startedAt: Date.now(),
              data
            });
      const startedAt = performance.now();
      const history = await takeNativeStartupHistory();
      return { history, elapsed: performance.now() - startedAt };
    }, scenario);
    expect(result.history).toEqual(
      scenario === 'stalled' ? null : [{ id: 'cached-topic' }]
    );
    expect(result.elapsed).toBeLessThan(2500);
    if (scenario === 'stalled') expect(result.elapsed).toBeGreaterThan(900);
  });
}

for (const scenario of ['empty', 'notification', 'unavailable'] as const) {
  test(`ранний Android-запуск передаёт результат проверки уведомления: ${scenario}`, async ({
    page
  }) => {
    await page.route('**/__native-startup', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><link rel="icon" href="/images/favicon.ico"><div id="app"></div>'
      })
    );
    await page.goto('/__native-startup');
    const result = await page.evaluate(async scenario => {
      let calls = 0;
      let reveals = 0;
      const payload =
        scenario === 'notification'
          ? { topicId: 'startup-topic', topicType: 'DM', messageId: 'latest' }
          : {};
      (window as any).Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
        Plugins: {
          NotificationTap: {
            consumePendingNotificationTap: async () => {
              calls++;
              if (scenario === 'unavailable')
                throw new Error('Bridge unavailable');
              return payload;
            }
          },
          LaunchStartup: {
            reveal: async () => {
              reveals++;
            }
          }
        }
      };
      await import('/src/startup.ts');
      await window.__chatNativeStartupCleanup;
      return {
        calls,
        reveals,
        // undefined сохраняет возможность повторить неудавшуюся проверку.
        cached: window.__chatNativeInitialNotificationTap ?? null,
        path: location.pathname,
        favicon:
          document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href
      };
    }, scenario);
    expect(result.calls).toBe(1);
    expect(result.favicon).toBe('data:,');
    expect(result.cached).toEqual(
      scenario === 'notification'
        ? { topicId: 'startup-topic', topicType: 'DM', messageId: 'latest' }
        : scenario === 'empty'
          ? {}
          : null
    );
    expect(result.path).toBe(
      scenario === 'notification'
        ? '/dialogs/startup-topic'
        : '/__native-startup'
    );
    expect(result.reveals).toBe(scenario === 'notification' ? 1 : 0);
  });
}
