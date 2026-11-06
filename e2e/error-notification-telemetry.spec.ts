import { expect, test } from '@playwright/test';

test('перехваченная ошибка сохраняется до перезагрузки и отправляется с источником', async ({
  page
}) => {
  // Первый импорт запускает обработку графа модулей приложения в Vite.
  test.slow();
  const events: Array<{
    name: string;
    payload: Record<string, unknown>;
  }> = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['localhost', '127.0.0.1'].includes(url.hostname)
      ? route.continue()
      : route.abort();
  });
  await page.route('**/__error-notification-telemetry', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><script type="module" src="/@vite/client"></script><div id="app"></div>'
    })
  );
  await page.route('**/notification-telemetry-api/telemetry/events', route => {
    events.push(...route.request().postDataJSON().events);
    return route.fulfill({ json: { accepted: events.length } });
  });
  await page.goto('/__error-notification-telemetry');
  const saved = await page.evaluate(async () => {
    const { showErrorNotification, useNotifications } = await import(
      '/src/composables/useNotifications.ts'
    );
    try {
      throw new DOMException('signal timed out', 'TimeoutError');
    } catch (error) {
      showErrorNotification(error);
    }
    return {
      description: useNotifications().state.items[0].description,
      events: JSON.parse(
        localStorage.getItem('chat.telemetry.network.pending.v1') || '[]'
      )
    };
  });
  expect(saved.description).toBe('signal timed out');
  expect(saved.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'notification.error.shown',
        level: 'error',
        payload: expect.objectContaining({
          errorName: 'TimeoutError',
          errorMessage: 'signal timed out',
          notificationStack: expect.any(Array)
        })
      })
    ])
  );

  await page.reload();
  await page.evaluate(async () => {
    document.cookie = 'authToken=notification-telemetry-test;path=/';
    const { setConfig } = await import('/src/services/useConfig.ts');
    setConfig({
      CHAT_API_DOMAIN: `${location.origin}/notification-telemetry-api`
    });
    const { flushTelemetryEvents } = await import(
      '/src/services/useTelemetry.ts'
    );
    await flushTelemetryEvents();
  });
  await expect
    .poll(() =>
      events.filter(event => event.name === 'notification.error.shown')
    )
    .toHaveLength(1);
  expect(
    events.find(event => event.name === 'notification.error.shown')?.payload
  ).toMatchObject({
    errorName: 'TimeoutError',
    errorMessage: 'signal timed out'
  });
  expect(errors).toEqual([]);
});
