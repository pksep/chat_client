import { expect, test, type Page } from '@playwright/test';
import {
  makeMessages,
  openFixture,
  openTopic,
  message
} from './fixtures/topic-performance-page';

async function collect(page: Page) {
  const events: any[] = [];
  await page.route('**/performance-api/telemetry/events', route => {
    events.push(...route.request().postDataJSON().events);
    return route.fulfill({ json: { accepted: events.length } });
  });
  await page.evaluate(() => {
    document.cookie = 'authToken=telemetry-test;path=/';
  });
  return events;
}

async function flush(page: Page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 8; i++)
      await (window as any).topicPerformance.telemetry.flushTelemetryEvents();
  });
}

test('история различает неполный HTTP, кэш и ошибку с возвратом сохранённых сообщений', async ({
  page
}) => {
  const { errors } = await openFixture(page);
  const events = await collect(page);
  const rows = makeMessages('performance-0', 40);
  rows[0].text = 'Закрытый текст сообщения';
  await page.evaluate(rows => {
    const fixture = (window as any).topicPerformance;
    fixture.setTopics([
      { ...fixture.getSelectedTopic('performance-0'), lastMessage: rows.at(-1) }
    ]);
  }, rows);
  await page.route(/\/messages\/topic\/performance-0(?:\?.*)?$/, route =>
    route.fulfill({ json: rows.slice(0, 30) })
  );
  await page.evaluate(async () => {
    const messages = (window as any).topicPerformance.messages;
    await messages.fetchMessagesForTopic('performance-0', {
      forceNetwork: true,
      forceRefresh: true
    });
    await messages.fetchMessagesForTopic('performance-0');
  });
  await page.route(/\/messages\/topic\/performance-0(?:\?.*)?$/, route =>
    route.fulfill({ status: 503, json: { message: 'Закрытая ошибка сервера' } })
  );
  await page.evaluate(() =>
    (window as any).topicPerformance.messages.fetchMessagesForTopic(
      'performance-0',
      { forceNetwork: true, forceRefresh: true }
    )
  );
  await flush(page);
  const history = events.filter(
    event => event.name === 'chat.history.resolved'
  );
  expect(history).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        payload: expect.objectContaining({
          source: 'network',
          response: expect.objectContaining({
            messageCount: 30,
            lastMessageId: rows[29].id,
            latestKnownMessageId: rows[39].id,
            includesLatestKnownMessage: false,
            messageIdsTruncated: true
          })
        })
      }),
      expect.objectContaining({
        payload: expect.objectContaining({ source: 'memory-store' })
      }),
      expect.objectContaining({
        level: 'warn',
        payload: expect.objectContaining({
          source: 'error-memory',
          result: expect.objectContaining({ messageCount: 30 })
        })
      })
    ])
  );
  expect(new Set(history.map(event => event.traceId)).size).toBe(
    history.length
  );
  expect(JSON.stringify(events)).not.toContain(rows[0].text);
  expect(JSON.stringify(events)).not.toContain('Закрытая ошибка сервера');
  expect(errors).toEqual([]);
});

test('снимок различает загруженное сообщение вне экрана и отложенное прочтение, сохраняет ID посещения при выходе', async ({
  page
}) => {
  const { errors } = await openFixture(page, { count: 32 });
  const events = await collect(page);
  const rows = makeMessages('performance-0', 32).map(row => ({
    ...row,
    isReadByMe: false
  }));
  await page.route(/\/messages\/topic\/performance-0(?:\?.*)?$/, route =>
    route.fulfill({ json: rows })
  );
  await page.evaluate(rows => {
    const fixture = (window as any).topicPerformance;
    fixture.setTopics([
      {
        ...fixture.getSelectedTopic('performance-0'),
        lastMessage: rows.at(-1),
        unreadMessageCount: 32
      }
    ]);
  }, rows);
  await openTopic(page, 0);
  await expect(message(page, 0, 0)).toBeInViewport();
  await expect
    .poll(async () => {
      await flush(page);
      return events.filter(event => event.name === 'chat.message_view.snapshot')
        .length;
    })
    .toBeGreaterThan(0);
  const snapshot = events.find(
    event => event.name === 'chat.message_view.snapshot'
  );
  expect(snapshot.payload).toMatchObject({
    loaded: { includesLatestKnownMessage: true },
    latestKnownMessageSeen: false,
    canSendReadReceipts: false
  });
  expect(snapshot.payload.visible.messageIds).not.toContain(rows[31].id);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'chat.message_view.read_decision',
        traceId: snapshot.traceId,
        payload: expect.objectContaining({
          decision: 'queued',
          serverConfirmed: false,
          canSendReadReceipts: false
        })
      })
    ])
  );
  await message(page, 0, 31).scrollIntoViewIfNeeded();
  await expect
    .poll(async () => {
      await flush(page);
      return events.some(
        event =>
          event.name === 'chat.message_view.snapshot' &&
          event.payload.latestKnownMessageSeen === true
      );
    })
    .toBe(true);
  const savedHidden = await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
    return JSON.parse(
      localStorage.getItem('chat.telemetry.network.pending.v1') || '[]'
    );
  });
  expect(savedHidden).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'chat.message_view.hidden',
        traceId: snapshot.traceId,
        payload: expect.objectContaining({ latestKnownMessageSeen: true })
      })
    ])
  );
  await page.evaluate(() =>
    (window as any).topicPerformance.navigate('performance-1')
  );
  await flush(page);
  const closed = events.find(
    event =>
      event.name === 'chat.message_view.closed' &&
      event.entityId === 'performance-0'
  );
  expect(closed).toMatchObject({
    traceId: snapshot.traceId,
    payload: {
      topicId: 'performance-0',
      loaded: { latestKnownMessageId: rows[31].id },
      latestKnownMessageSeen: true
    }
  });
  const next = events.find(
    event =>
      event.name === 'chat.message_view.opened' &&
      event.entityId === 'performance-1'
  );
  expect(next.traceId).not.toBe(closed.traceId);
  expect(
    JSON.stringify(
      events.filter(event => event.name.startsWith('chat.message_view.'))
    )
  ).not.toContain(rows[0].text);
  expect(errors).toEqual([]);
});

test('доставка различает очередь, неуспешный ACK и подтверждённый повтор без ложного успеха', async ({
  page
}) => {
  const { errors } = await openFixture(page);
  const events = await collect(page);
  await page.clock.install();
  await page.evaluate(row => {
    const sdk = (window as any).topicPerformance.sdk;
    sdk.socket = { connected: true, emit: () => {} };
    let attempts = 0;
    sdk.ws.sendWebSocketEventWithAck = async () => ({
      success: ++attempts > 1
    });
    sdk.handleWebSocketEvent({
      type: 'changeMessage',
      payload: {
        type: 'NEW',
        topicId: row.topicId,
        data: {
          ...row,
          deliveryState: {
            recipientUserIds: ['performance-user'],
            delivered: [],
            read: []
          }
        }
      }
    });
  }, makeMessages('performance-0', 1)[0]);
  await page.clock.fastForward(100);
  await flush(page);
  expect(
    events.some(event => event.name === 'chat.delivery_receipt.confirmed')
  ).toBe(false);
  const failed = events.find(
    event => event.name === 'chat.delivery_receipt.failed'
  );
  expect(failed).toMatchObject({
    payload: { serverConfirmed: false, messageCount: 1 }
  });
  await page.clock.fastForward(5100);
  await flush(page);
  const confirmed = events.find(
    event => event.name === 'chat.delivery_receipt.confirmed'
  );
  expect(confirmed).toMatchObject({
    payload: { serverConfirmed: true, messageCount: 1 }
  });
  expect(confirmed.traceId).not.toBe(failed.traceId);
  expect(
    events.filter(event => event.name === 'chat.delivery_receipt.emitted')
  ).toHaveLength(2);
  expect(
    events.filter(event => event.name === 'chat.delivery_receipt.queued')
  ).toHaveLength(1);
  expect(errors).toEqual([]);
});
