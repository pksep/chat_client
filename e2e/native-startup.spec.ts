import { expect, test } from '@playwright/test';

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
