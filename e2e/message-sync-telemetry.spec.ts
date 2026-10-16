import { expect, test, type Page } from '@playwright/test';
import { makeMessages, openFixture } from './fixtures/topic-performance-page';

const topicId = 'performance-0';
const messageId = `${topicId}-message-0`;

async function collectTelemetry(page: Page, events: any[]) {
  await page.route('**/performance-api/telemetry/events', route => {
    events.push(...route.request().postDataJSON().events);
    return route.fulfill({ json: { accepted: events.length } });
  });
  await page.evaluate(() => {
    document.cookie = 'authToken=telemetry-test;path=/';
  });
}

async function flush(page: Page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 6; i++)
      await (window as any).topicPerformance.telemetry.flushTelemetryEvents();
  });
}

test('долгое удаление записывает предупреждение и завершает ту же цепочку после ответа', async ({
  page
}) => {
  await openFixture(page);
  await page.clock.install();
  const events: any[] = [];
  await collectTelemetry(page, events);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route(`**/messages/topic/${topicId}/${messageId}`, async route => {
    await gate;
    await route.fulfill({ json: { id: messageId, topicId } });
  });
  const request = page.waitForRequest(req => req.method() === 'DELETE');
  try {
    await page.evaluate(() => {
      (window as any).pendingDeletion = (
        window as any
      ).topicPerformance.deleteMessageChat({
        topicId: 'performance-0',
        messageId: 'performance-0-message-0'
      });
    });
    await request;
    await page.clock.fastForward(15_001);
    await flush(page);
    const slow = events.find(
      event => event.name === 'chat.message_delete.slow'
    );
    expect(slow).toMatchObject({
      level: 'warn',
      payload: { serverConfirmed: false }
    });
    expect(slow.payload.elapsedMs).toBeGreaterThanOrEqual(15_000);
    expect(slow.payload.elapsedMs).toBeLessThan(20_000);
    release();
    await page.evaluate(() => (window as any).pendingDeletion);
    await flush(page);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'chat.message_delete.confirmed',
          traceId: slow.traceId
        })
      ])
    );
    await page.clock.fastForward(30_000);
    await flush(page);
    expect(
      events.filter(event => event.name === 'chat.message_delete.slow')
    ).toHaveLength(1);
  } finally {
    release();
  }
});

test('удаление пишет подтверждённую цепочку, устройство и блокировку старой истории без текста сообщения', async ({
  page
}) => {
  await openFixture(page);
  const events: any[] = [];
  await collectTelemetry(page, events);
  const rows = makeMessages(topicId, 2);
  rows[0].senderUserId = 'performance-user';
  rows[0].text = 'Секретный текст для проверки телеметрии';
  await page.evaluate(async rows => {
    const fixture = (window as any).topicPerformance;
    fixture.seed('performance-0', rows);
    await fixture.deleteMessageChat({
      topicId: 'performance-0',
      messageId: rows[0].id
    });
    for (let i = 0; i < 4; i++) fixture.seed('performance-0', rows);
  }, rows);
  await flush(page);
  const deletion = events.filter(event =>
    event.name.startsWith('chat.message_delete.')
  );
  const requested = deletion.find(event => event.name.endsWith('.requested'));
  expect(requested).toMatchObject({
    entityType: 'message',
    entityId: messageId,
    payload: { topicId, messageId, serverConfirmed: false },
    context: {
      installationId: expect.any(String),
      platform: expect.any(String)
    }
  });
  expect(deletion).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'chat.message_delete.confirmed',
        traceId: requested.traceId,
        payload: expect.objectContaining({ serverConfirmed: true })
      }),
      expect.objectContaining({
        name: 'chat.message_delete.applied',
        traceId: requested.traceId,
        payload: expect.objectContaining({
          source: 'http',
          remainingInMemory: false
        })
      }),
      expect.objectContaining({
        name: 'chat.message_delete.stale_filtered',
        level: 'warn',
        payload: expect.objectContaining({
          blocked: true,
          source: 'message_store'
        })
      })
    ])
  );
  expect(
    deletion.filter(event => event.name.endsWith('.stale_filtered'))
  ).toHaveLength(1);
  expect(JSON.stringify(events)).not.toContain(rows[0].text);
  expect(deletion.some(event => event.name.endsWith('.failed'))).toBe(false);
});

test('ошибка HTTP сохраняет код причины и не записывает ложное подтверждение', async ({
  page
}) => {
  await openFixture(page);
  const events: any[] = [];
  await collectTelemetry(page, events);
  await page.route(`**/messages/topic/${topicId}/${messageId}`, route =>
    route.fulfill({ status: 403, json: { message: 'Закрытые данные сервера' } })
  );
  await page.evaluate(async () => {
    await (window as any).topicPerformance.deleteMessageChat({
      topicId: 'performance-0',
      messageId: 'performance-0-message-0'
    });
  });
  await flush(page);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'chat.message_delete.failed',
        level: 'error',
        payload: expect.objectContaining({
          httpStatus: 403,
          serverConfirmed: false
        })
      })
    ])
  );
  expect(
    events.some(event => event.name === 'chat.message_delete.confirmed')
  ).toBe(false);
  expect(JSON.stringify(events)).not.toContain('Закрытые данные сервера');
});

test('применение удаления различает сокет, replay и фоновый снимок Android', async ({
  page
}) => {
  await openFixture(page);
  const events: any[] = [];
  await collectTelemetry(page, events);
  await page.evaluate(async () => {
    const fixture = (window as any).topicPerformance;
    fixture.emitChatEvent({
      type: 'changeMessage',
      payload: {
        type: 'DELETE',
        data: { topicId: 'performance-0', id: 'from-socket' },
        ptsMeta: { eventId: 'event-ws', pts: '10', topicId: 'performance-0' }
      }
    });
    fixture.emitChatEvent({
      type: 'syncReplay',
      payload: {
        fromPts: '10',
        toPts: '11',
        hasMore: false,
        events: [
          {
            eventId: 'event-replay',
            pts: '11',
            topicId: 'performance-0',
            eventType: 'message.delete',
            payload: {
              type: 'DELETE',
              data: { topicId: 'performance-0', id: 'from-replay' }
            }
          }
        ]
      }
    });
    await fixture.importChatBackgroundSnapshot(
      {
        available: true,
        userId: 'performance-user',
        events: [
          {
            eventId: 'event-native',
            pts: '12',
            topicId: 'performance-0',
            eventType: 'message.delete',
            payload: { type: 'DELETE', data: { id: 'from-native' } }
          }
        ]
      },
      'performance-user',
      { provider: 'native' }
    );
  });
  await flush(page);
  for (const [source, id, pts] of [
    ['ws', 'socket', '10'],
    ['replay', 'replay', '11'],
    ['native', 'native', '12']
  ]) {
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'chat.message_delete.applied',
          entityId: `from-${id}`,
          payload: expect.objectContaining({ source, pts })
        })
      ])
    );
  }
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'chat.sync.replay_page',
        payload: expect.objectContaining({
          fromPts: '10',
          toPts: '11',
          deletionCount: 1,
          hasMore: false
        })
      })
    ])
  );
});

test('ошибка сохранения удаления в IndexedDB видна в телеметрии', async ({
  page
}) => {
  await openFixture(page);
  const events: any[] = [];
  await collectTelemetry(page, events);
  await page.evaluate(async () => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (
        this.name === 'syncMeta' &&
        args[0]?.key === 'performance-user:deletedMessages:performance-0'
      )
        throw new DOMException('Тестовый сбой записи', 'QuotaExceededError');
      return put.apply(this, args);
    };
    try {
      await (window as any).topicPerformance.messages.deleteMessageFromLocal(
        'performance-0',
        'cache-error-message'
      );
    } finally {
      IDBObjectStore.prototype.put = put;
    }
  });
  await flush(page);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'chat.message_delete.cache_failed',
        level: 'error',
        entityId: 'cache-error-message',
        payload: expect.objectContaining({ reason: 'tombstone_write_failed' })
      })
    ])
  );
});

test('исправленное расхождение статусов и удаление переживают офлайн-перезапуск телеметрии', async ({
  page,
  context
}) => {
  await openFixture(page);
  await context.setOffline(true);
  const saved = await page.evaluate(
    async rows => {
      const fixture = (window as any).topicPerformance;
      fixture.setTopics([
        {
          ...fixture.getSelectedTopic('performance-0'),
          lastMessage: { ...rows[0], status: 'READ' }
        }
      ]);
      fixture.setTopics([
        {
          ...fixture.getSelectedTopic('performance-0'),
          lastMessage: { ...rows[0], status: 'WAIT' }
        }
      ]);
      await fixture.messages.deleteMessageFromLocal(
        'performance-0',
        'offline-deletion'
      );
      return JSON.parse(
        localStorage.getItem('chat.telemetry.network.pending.v1') || '[]'
      );
    },
    makeMessages(topicId, 1)
  );
  expect(saved).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'chat.topic_state.mismatch',
        payload: expect.objectContaining({
          statusReconciled: true,
          incomingStatus: 'WAIT',
          topicStatus: 'READ'
        })
      }),
      expect.objectContaining({
        name: 'chat.message_delete.applied',
        entityId: 'offline-deletion'
      })
    ])
  );
  await context.setOffline(false);
  await openFixture(page);
  const events: any[] = [];
  await collectTelemetry(page, events);
  await flush(page);
  for (const event of saved)
    expect(events.some(row => row.id === event.id)).toBe(true);
  expect(
    await page.evaluate(() =>
      localStorage.getItem('chat.telemetry.network.pending.v1')
    )
  ).toBeNull();
});
