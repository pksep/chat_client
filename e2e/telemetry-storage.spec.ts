import { expect, test, type Page } from '@playwright/test';
import { readLokiEvents } from '../scripts/telemetry-local/loki-query.mjs';

const apiUrl = process.env.TELEMETRY_LOCAL_API_URL!;
const readEvents = () =>
  readLokiEvents(
    process.env.TELEMETRY_LOCAL_LOKI_URL!,
    process.env.TELEMETRY_LOCAL_RUN_ID!
  );
const flush = (page: Page) =>
  page.evaluate(async () => {
    const telemetry = await import('/src/services/useTelemetry.ts');
    await telemetry.flushTelemetryEvents();
  });
const savedEvents = async (page: Page) => {
  await flush(page);
  return readEvents();
};

test.setTimeout(60_000);
test.use({
  permissions: ['geolocation'],
  geolocation: { latitude: 40.18, longitude: 44.51, accuracy: 25 },
  extraHTTPHeaders: { 'X-Forwarded-For': '81.2.69.142' }
});

async function openFixture(page: Page) {
  page.on('requestfailed', request => {
    if (request.url().startsWith(apiUrl)) {
      console.error('Telemetry HTTP:', request.failure()?.errorText);
    }
  });
  page.on('response', async response => {
    if (response.url().startsWith(apiUrl) && !response.ok()) {
      console.error(
        'Telemetry HTTP:',
        response.status(),
        await response.text()
      );
    }
  });
  await page.addInitScript(token => {
    document.cookie = `authToken=${token};path=/`;
  }, process.env.TELEMETRY_LOCAL_TOKEN!);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname))
      return route.abort();
    if (url.pathname === '/__telemetry-storage') {
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module" src="/@vite/client"></script><div id="app"></div>'
      });
    }
    // POST телеметрии идёт в настоящий Nest API, без подмены ответа.
    return route.continue();
  });
  await page.goto('/__telemetry-storage');
  await page.evaluate(async url => {
    const { setConfig } = await import('/src/services/useConfig.ts');
    setConfig({ CHAT_API_DOMAIN: url });
  }, apiUrl);
}

test('сохраняет IP и координаты по умолчанию; отзыв разрешения удаляет координаты из очереди', async ({
  page,
  context
}) => {
  await openFixture(page);
  await page.evaluate(async () => {
    const telemetry = await import('/src/services/useTelemetry.ts');
    telemetry.recordTelemetryEvent({
      category: 'chat',
      name: 'chat.telemetry_local.location_default',
      traceId: 'local-location-default'
    });
    telemetry.recordTelemetryEvent({
      category: 'chat',
      name: 'chat.message_send.start',
      traceId: 'local-message-location',
      payload: { topicId: 'local-location-topic' }
    });
  });
  await expect
    .poll(() => savedEvents(page), { timeout: 20_000 })
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_name: 'chat.message_send.location',
          trace_id: 'local-message-location',
          user_id: 'telemetry-local-user',
          payload: expect.objectContaining({
            topicId: 'local-location-topic',
            sendOccurredAt: expect.any(String)
          }),
          context: expect.objectContaining({
            location: expect.objectContaining({
              ip: expect.objectContaining({
                status: 'resolved',
                countryCode: 'GB',
                city: expect.any(String)
              }),
              device: expect.objectContaining({
                latitude: 40.18,
                longitude: 44.51,
                accuracyMeters: 25
              })
            })
          })
        })
      ])
    );
  await page.evaluate(async () => {
    const telemetry = await import('/src/services/useTelemetry.ts');
    telemetry.recordTelemetryEvent({
      category: 'chat',
      name: 'chat.telemetry_local.location_revoked',
      traceId: 'local-location-revoked'
    });
  });
  await context.clearPermissions();
  await page.evaluate(async () => {
    const geo = await import('/src/services/useTelemetryLocation.ts');
    await geo.refreshTelemetryLocation();
  });
  await expect
    .poll(() => savedEvents(page))
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({ trace_id: 'local-location-revoked' })
      ])
    );
  const events = await readEvents();
  for (const trace of ['local-location-default', 'local-location-revoked']) {
    const event = events.find(item => item.trace_id === trace);
    expect(event.context.location.ip.status).toBe('resolved');
    expect(event.context.location.device?.latitude).toBeUndefined();
    expect(event.context.location.device?.longitude).toBeUndefined();
  }
  expect(JSON.stringify(events)).not.toContain('81.2.69.142');
});

test('сохраняет реальные диагностики отображаемого статуса, непрочитанного и зависшего WAIT', async ({
  page
}) => {
  await openFixture(page);
  await page.evaluate(async () => {
    await import('/src/assets/chat-container.css');
    const { createApp, h, reactive } = await import(
      '/e2e/fixtures/telemetry-storage-harness.ts'
    );
    const { authedUser } = await import('/src/composables/useAuth.ts');
    authedUser.value = { id: 'self', initials: 'Т' };
    const messages = await import('/src/services/useMessages.ts');
    messages.saveMessagesToLocal('local-topic', [
      {
        id: 'local-message',
        topicId: 'local-topic',
        senderUserId: 'self',
        status: 'READ',
        createdAt: new Date().toISOString()
      }
    ]);
    const { default: Content } = await import(
      '/src/components/ContactList/TopicListItemContent.vue'
    );
    const topic = reactive({
      id: 'local-topic',
      name: 'Локальная проверка',
      type: 'DM',
      info: { isMarkedUnread: true },
      unreadMessageCount: 0,
      lastMessage: {
        id: 'local-message',
        topicId: 'local-topic',
        senderUserId: 'self',
        status: 'WAIT',
        createdAt: new Date().toISOString()
      }
    });
    createApp({ render: () => h(Content, { topic, index: 0 }) }).mount('#app');
    (window as any).localTopicFixture = { topic, messages };
  });
  await expect(page.locator('.is-read')).toBeVisible();
  await expect(page.locator('.contact-list__notification')).toBeVisible();
  await expect
    .poll(() => savedEvents(page))
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_name: 'chat.topic_state.mismatch',
          payload: expect.objectContaining({
            source: 'topic_list_render',
            topicStatus: 'WAIT',
            clientStatus: 'READ',
            displayedStatus: 'READ',
            isMarkedUnread: true,
            unreadBadgeCount: 0,
            showUnreadIndicator: true
          })
        })
      ])
    );
  await page.clock.install();
  await page.evaluate(() => {
    const { topic, messages } = (window as any).localTopicFixture;
    messages.saveMessagesToLocal(topic.id, [
      { ...topic.lastMessage, status: 'WAIT' }
    ]);
  });
  await page.clock.runFor(15_000);
  await page.evaluate(() => {
    const { topic } = (window as any).localTopicFixture;
    topic.lastMessage = { ...topic.lastMessage };
    topic.info.isMarkedUnread = false;
  });
  await page.clock.runFor(15_001);
  await expect
    .poll(() => savedEvents(page))
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_name: 'chat.topic_state.mismatch',
          payload: expect.objectContaining({
            source: 'topic_list_wait_timeout',
            displayedStatus: 'WAIT'
          })
        })
      ])
    );
});

test('сохраняет причину ошибки RuStore и таймаут при отсутствии прогресса', async ({
  page
}) => {
  await page.addInitScript(() => {
    (window as any).androidBridge = {};
    (window as any).localUpdateFails = true;
    (window as any).Capacitor = {
      PluginHeaders: [
        {
          name: 'App',
          methods: [
            { name: 'getInfo', rtype: 'promise' },
            { name: 'getState', rtype: 'promise' },
            { name: 'addListener' },
            { name: 'removeListener', rtype: 'promise' }
          ]
        },
        {
          name: 'RuStoreUpdate',
          methods: [
            { name: 'getAppUpdateInfo', rtype: 'promise' },
            { name: 'startFlexibleUpdate', rtype: 'promise' },
            { name: 'addListener' }
          ]
        }
      ],
      async nativePromise(plugin: string, method: string) {
        if (plugin === 'App') return { version: '1.6.6' };
        if (method === 'getAppUpdateInfo') {
          return {
            updateAvailability: 2,
            installStatus: 0,
            availableVersionCode: 200
          };
        }
        if (method === 'startFlexibleUpdate') {
          if ((window as any).localUpdateFails) {
            throw Object.assign(new Error('Тест: загрузка недоступна'), {
              code: 'LOCAL_DOWNLOAD_UNAVAILABLE'
            });
          }
          return { resultCode: -1 };
        }
      },
      async nativeCallback() {
        return 'local-update-listener';
      }
    };
  });
  await openFixture(page);
  await page.evaluate(async () => {
    const { createApp, h } = await import(
      '/e2e/fixtures/telemetry-storage-harness.ts'
    );
    const { useMobileApp } = await import('/src/composables/useMobileApp.ts');
    createApp({
      setup() {
        const updates = useMobileApp();
        (window as any).localUpdates = updates;
        return () =>
          h(
            'button',
            {
              disabled:
                !updates.hasCheckedForUpdates.value ||
                updates.isUpdateActionDisabled.value,
              onClick: () => void updates.handleUpdateClick()
            },
            'Обновить'
          );
      }
    }).mount('#app');
  });
  const button = page.getByRole('button', { name: 'Обновить' });
  await expect(button).toBeEnabled();
  await button.click();
  await expect
    .poll(() => savedEvents(page))
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_name: 'app.update.failed',
          level: 'error',
          trace_id: expect.any(String),
          payload: expect.objectContaining({
            step: 'start',
            errorMessage: 'Тест: загрузка недоступна',
            errorCode: 'LOCAL_DOWNLOAD_UNAVAILABLE'
          })
        })
      ])
    );
  await page.evaluate(() => {
    (window as any).localUpdateFails = false;
  });
  await page.clock.install();
  await button.click();
  await expect(button).toBeEnabled();
  await page.clock.runFor(60_001);
  await expect
    .poll(() => savedEvents(page))
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_name: 'app.update.start.result',
          payload: expect.objectContaining({ resultCode: -1 })
        }),
        expect.objectContaining({
          event_name: 'app.update.progress_timeout',
          payload: expect.objectContaining({
            stage: 'awaiting_download_progress'
          })
        })
      ])
    );
  const updates = (await readEvents()).filter(event =>
    event.event_name.startsWith('app.update.')
  );
  const failed = updates.find(
    event => event.event_name === 'app.update.failed'
  );
  const timeout = updates.find(
    event => event.event_name === 'app.update.progress_timeout'
  );
  expect(failed.trace_id).not.toBe(timeout.trace_id);
  for (const event of [failed, timeout]) {
    expect(
      updates.some(
        item =>
          item.event_name === 'app.update.click' &&
          item.trace_id === event.trace_id
      )
    ).toBe(true);
    expect(
      updates.some(
        item =>
          item.event_name === 'app.update.start.requested' &&
          item.trace_id === event.trace_id
      )
    ).toBe(true);
  }
});
