import { expect, test } from '@playwright/test';

test('телеметрия отправляет координаты с trace сообщения и очищает очередь при отключении', async ({
  page
}) => {
  const events: any[] = [];
  await page.route('**/__telemetry-context', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><div id="app"></div>'
    })
  );
  await page.route('**/telemetry-test-api/telemetry/events', route => {
    events.push(...route.request().postDataJSON().events);
    return route.fulfill({ json: { accepted: events.length } });
  });
  await page.goto('/__telemetry-context');
  const persisted = await page.evaluate(async () => {
    document.cookie = 'authToken=telemetry-test;path=/';
    const { setConfig } = await import('/src/services/useConfig.ts');
    setConfig({ CHAT_API_DOMAIN: `${location.origin}/telemetry-test-api` });
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      value: (resolve: PositionCallback) =>
        resolve({
          timestamp: Date.now(),
          coords: { latitude: 40.18, longitude: 44.51, accuracy: 25 }
        } as GeolocationPosition)
    });
    const geo = await import('/src/services/useTelemetryLocation.ts');
    await geo.useTelemetryLocation().setEnabled(true);
    const telemetry = await import('/src/services/useTelemetry.ts');
    telemetry.recordTelemetryEvent({
      category: 'chat',
      name: 'chat.message_send.start',
      traceId: 'message-location-trace',
      payload: { topicId: 'topic' }
    });
    await Promise.resolve();
    await telemetry.flushTelemetryEvents();
    telemetry.recordTelemetryEvent({
      category: 'network',
      name: 'network.offline'
    });
    const persisted = JSON.parse(
      localStorage.getItem('chat.telemetry.network.pending.v1') || '[]'
    );
    telemetry.recordTelemetryEvent({
      category: 'chat',
      name: 'chat.queued_before_location_disabled'
    });
    await geo.useTelemetryLocation().setEnabled(false);
    await telemetry.flushTelemetryEvents();
    return persisted;
  });
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'chat.message_send.location',
        traceId: 'message-location-trace',
        payload: expect.objectContaining({
          topicId: 'topic',
          sendOccurredAt: expect.any(String)
        }),
        context: expect.objectContaining({
          location: expect.objectContaining({
            device: expect.objectContaining({
              latitude: 40.18,
              accuracyMeters: 25
            })
          })
        })
      })
    ])
  );
  expect(persisted.length).toBeGreaterThan(0);
  expect(persisted[0].context.location).toBeUndefined();
  expect(
    events.find(event => event.name === 'chat.queued_before_location_disabled')
      .context.location
  ).toBeUndefined();
});

test('список топиков записывает расхождение статуса, ручную метку и зависший WAIT', async ({
  page
}) => {
  const events: any[] = [];
  await page.route('**/__topic-telemetry', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><div id="app"></div>'
    })
  );
  await page.route('**/telemetry-test-api/telemetry/events', route => {
    events.push(...route.request().postDataJSON().events);
    return route.fulfill({ json: { accepted: events.length } });
  });
  await page.goto('/__topic-telemetry');
  await page.evaluate(async () => {
    await import('/src/assets/chat-container.css');
    document.cookie = 'authToken=telemetry-test;path=/';
    const { setConfig } = await import('/src/services/useConfig.ts');
    setConfig({ CHAT_API_DOMAIN: `${location.origin}/telemetry-test-api` });
    const { createApp, h, reactive } = await import(
      '/node_modules/.vite/deps/vue.js'
    );
    const { authedUser } = await import('/src/composables/useAuth.ts');
    authedUser.value = { id: 'self', initials: 'Т' };
    const messages = await import('/src/services/useMessages.ts');
    messages.saveMessagesToLocal('topic', [
      {
        id: 'message',
        topicId: 'topic',
        senderUserId: 'self',
        status: 'READ',
        createdAt: new Date().toISOString()
      }
    ]);
    const { default: Content } = await import(
      '/src/components/ContactList/TopicListItemContent.vue'
    );
    const topic = reactive({
      id: 'topic',
      name: 'Тест',
      type: 'DM',
      info: { isMarkedUnread: true },
      unreadMessageCount: 0,
      lastMessage: {
        id: 'message',
        topicId: 'topic',
        senderUserId: 'self',
        status: 'WAIT',
        createdAt: new Date().toISOString()
      }
    });
    createApp({ render: () => h(Content, { topic, index: 0 }) }).mount('#app');
    (window as any).topicTelemetry = { topic, messages };
  });
  await expect(page.locator('.is-read')).toBeVisible();
  await expect(page.locator('.contact-list__notification')).toBeVisible();
  await page.evaluate(async () => {
    const t = await import('/src/services/useTelemetry.ts');
    await t.flushTelemetryEvents();
  });
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'chat.topic_state.mismatch',
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
    const fixture = (window as any).topicTelemetry;
    fixture.messages.saveMessagesToLocal('topic', [
      { ...fixture.topic.lastMessage, status: 'WAIT' }
    ]);
  });
  await page.clock.runFor(15_000);
  await page.evaluate(() => {
    const fixture = (window as any).topicTelemetry;
    fixture.topic.lastMessage = { ...fixture.topic.lastMessage };
    fixture.topic.info.isMarkedUnread = false;
  });
  await page.clock.runFor(15_001);
  await page.evaluate(async () => {
    const t = await import('/src/services/useTelemetry.ts');
    await t.flushTelemetryEvents();
  });
  await expect
    .poll(() => events)
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'chat.topic_state.mismatch',
          payload: expect.objectContaining({
            source: 'topic_list_wait_timeout',
            displayedStatus: 'WAIT'
          })
        })
      ])
    );
});
