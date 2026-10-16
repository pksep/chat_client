import { expect, test } from '@playwright/test';
import {
  makeMessages,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

test('параллельные удаления сохраняются после перезапуска и фильтруют старый кеш', async ({
  page
}) => {
  await openFixture(page);
  const rows = makeMessages('performance-0', 25);
  const deleted = rows.slice(0, 24).map(row => row.id);
  const saved = await page.evaluate(async rows => {
    const fixture = (window as any).topicPerformance;
    fixture.seed('performance-0', rows);
    await fixture.shadow.saveShadowTopicSnapshot('performance-0', rows, 'http');
    const writes = rows
      .slice(0, 24)
      .map((row: any) =>
        fixture.messages.deleteMessageFromLocal('performance-0', row.id)
      );
    // Чтение начинается, пока записи ещё выполняются.
    const ids = [
      ...(await fixture.shadow.loadShadowDeletedMessageIds('performance-0'))
    ];
    await Promise.all(writes);
    await fixture.shadow.saveShadowTopicSnapshot(
      'performance-0',
      rows,
      'http',
      undefined,
      { replace: true }
    );
    return ids;
  }, rows);
  expect(saved.sort()).toEqual(deleted.sort());

  await openFixture(page);
  const restored = await page.evaluate(async () => {
    const fixture = (window as any).topicPerformance;
    await fixture.messages.hydrateMessagesFromCache(
      'performance-0',
      'performance-user'
    );
    return {
      ids: [
        ...(await fixture.shadow.loadShadowDeletedMessageIds('performance-0'))
      ],
      messages: fixture.messages
        .getFullMessagesByTopicId('performance-0')
        .map((row: any) => row.id)
    };
  });
  expect(restored.ids.sort()).toEqual(deleted.sort());
  expect(restored.messages).toEqual([rows[24].id]);
});

test('фоновый снимок Android применяет удаления до старой истории и сохраняет курсор полного replay', async ({
  page
}) => {
  await openFixture(page);
  const rows = makeMessages('performance-0', 3);
  const result = await page.evaluate(async rows => {
    const fixture = (window as any).topicPerformance;
    fixture.seed('performance-0', rows);
    await fixture.shadow.saveShadowSyncMeta('pts:last', { pts: '10' });
    await fixture.importChatBackgroundSnapshot(
      {
        available: true,
        userId: 'performance-user',
        fromPts: '10',
        toPts: '250',
        lastPts: '250',
        messagesByTopic: { 'performance-0': rows },
        events: [
          {
            eventId: 'deleted',
            pts: '249',
            topicId: 'performance-0',
            eventType: 'message.delete',
            payload: {
              type: 'DELETE',
              data: { id: rows[0].id, topicId: 'performance-0' },
              scope: 'ALL'
            }
          },
          {
            eventId: 'other-user',
            pts: '250',
            topicId: 'performance-0',
            eventType: 'message.delete',
            payload: {
              type: 'DELETE',
              data: { id: rows[1].id },
              scope: 'SELF',
              targetUserId: 'other-user'
            }
          }
        ]
      },
      'performance-user',
      { provider: 'native' }
    );
    return {
      messages: fixture.messages
        .getFullMessagesByTopicId('performance-0')
        .map((row: any) => row.id),
      cursor: await fixture.shadow.loadShadowSyncMeta('pts:last'),
      snapshot: (
        await fixture.shadow.loadShadowTopicSnapshot('performance-0')
      ).map((row: any) => row.id)
    };
  }, rows);
  expect(result.messages).toEqual([rows[1].id, rows[2].id]);
  expect(result.snapshot).toEqual(result.messages);
  expect(result.cursor).toEqual({ pts: '10' });

  await openFixture(page);
  const coldImport = await page.evaluate(async rows => {
    const fixture = (window as any).topicPerformance;
    // Следующий снимок уже не содержит старое событие удаления.
    await fixture.importChatBackgroundSnapshot(
      {
        available: true,
        userId: 'performance-user',
        lastPts: '251',
        messagesByTopic: { 'performance-0': rows },
        events: []
      },
      'performance-user',
      { provider: 'native' }
    );
    return fixture.messages
      .getFullMessagesByTopicId('performance-0')
      .map((row: any) => row.id);
  }, rows);
  expect(coldImport).toEqual([rows[1].id, rows[2].id]);
});

for (const hasMore of [true, undefined]) {
  test(`replay получает удаление со второй страницы после 200 событий: hasMore=${hasMore}`, async ({
    page
  }) => {
    await openFixture(page, { count: 2, topicCount: 2 });
    await openTopic(page, 0);
    await expect(
      page.locator('[data-message-id="performance-0-message-0"]').first()
    ).toBeVisible();
    await openTopic(page, 1);
    const requests = await page.evaluate(hasMore => {
      const fixture = (window as any).topicPerformance;
      const sent: unknown[] = [];
      fixture.sdk.sendWebSocketEvent = (type: string, payload: unknown) => {
        sent.push({ type, payload });
        return true;
      };
      fixture.emitChatEvent({
        type: 'syncReplay',
        payload: {
          fromPts: '10',
          toPts: '210',
          hasMore,
          events: Array.from({ length: 200 }, (_, index) => ({
            eventId: `replay-${index}`,
            pts: String(index + 11),
            topicId: 'performance-0',
            eventType: 'test.unknown',
            payload: {}
          }))
        }
      });
      fixture.emitChatEvent({
        type: 'syncReplay',
        payload: {
          fromPts: '210',
          toPts: '211',
          hasMore: false,
          events: [
            {
              eventId: 'deleted',
              pts: '211',
              topicId: 'performance-0',
              eventType: 'message.delete',
              payload: {
                type: 'DELETE',
                data: {
                  id: 'performance-0-message-0',
                  topicId: 'performance-0'
                }
              }
            }
          ]
        }
      });
      return sent;
    }, hasMore);
    expect(requests).toEqual([{ type: 'syncState', payload: { pts: '210' } }]);
    await openTopic(page, 0);
    await expect(
      page.locator('[data-message-id="performance-0-message-0"]')
    ).toHaveCount(0);
    await expect(
      page.locator('[data-message-id="performance-0-message-1"]').first()
    ).toBeVisible();
  });
}

test('удаление с другого устройства применяется в закрытом топике и выдерживает старую историю', async ({
  page
}) => {
  await openFixture(page, { count: 2, topicCount: 2 });
  await openTopic(page, 0);
  await expect(
    page.locator('[data-message-id="performance-0-message-0"]').first()
  ).toBeVisible();
  await openTopic(page, 1);
  await page.evaluate(() => {
    (window as any).topicPerformance.emitChatEvent({
      type: 'changeMessage',
      payload: {
        type: 'DELETE',
        scope: 'ALL',
        topicId: 'performance-0',
        data: { id: 'performance-0-message-0', topicId: 'performance-0' },
        ptsMeta: {
          pts: '99',
          topicId: 'performance-0',
          eventId: 'remote-deletion'
        }
      }
    });
  });
  await openTopic(page, 0);
  await expect(
    page.locator('[data-message-id="performance-0-message-0"]')
  ).toHaveCount(0);
  await page.evaluate(
    rows => (window as any).topicPerformance.seed('performance-0', rows),
    makeMessages('performance-0', 2)
  );
  await expect(
    page.locator('[data-message-id="performance-0-message-0"]')
  ).toHaveCount(0);
});
