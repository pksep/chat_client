import { expect, test } from '@playwright/test';
import { openFixture } from './fixtures/topic-performance-page';

test('после месяца без входа GetTopics заменяет старый PTS без replay накопленных событий', async ({
  page
}) => {
  await openFixture(page);
  const requests: string[] = [];
  await page.route('**/performance-api/topics?*', route => {
    requests.push(route.request().url());
    return route.fulfill({
      json: {
        data: [{ id: 'performance-0', name: 'Актуальный чат', type: 'DM' }],
        unreadTopics: [],
        sync: { version: 1, pts: '10000', syncedAt: new Date().toISOString() },
        meta: { totalItems: 1, currentPage: 1, totalPages: 1 }
      }
    });
  });
  await page.evaluate(async () => {
    const fixture = (window as any).topicPerformance;
    await fixture.shadow.saveShadowSyncMeta('pts:last', {
      pts: '10',
      timestamp: new Date(Date.now() - 31 * 86400_000).toISOString()
    });
    const sent: unknown[] = [];
    (window as any).ptsRecoverySent = sent;
    const sdk = Object.getPrototypeOf(fixture.sdk);
    sdk.connect = async () => {};
    sdk.sendWebSocketEvent = (type: string, payload: unknown) => {
      if (type === 'syncState') sent.push(payload);
      return true;
    };
    await fixture.initializeChat({
      userId: 'performance-user',
      token: 'performance-test',
      apiUrl: `${location.origin}/performance-api`,
      wsUrl: 'ws://127.0.0.1:65530'
    });
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).ptsRecoverySent))
    .toEqual([{ pts: '10000' }]);
  expect(requests).toHaveLength(1);
  expect(new URL(requests[0]).searchParams.get('includeSync')).toBe('true');
  const cursor = await page.evaluate(async () => {
    const fixture = (window as any).topicPerformance;
    fixture.emitChatEvent({
      type: 'syncReplay',
      payload: {
        fromPts: '10',
        toPts: '11',
        hasMore: true,
        events: [
          {
            eventId: 'late',
            pts: '11',
            topicId: 'performance-0',
            eventType: 'test.unknown',
            payload: {}
          }
        ]
      }
    });
    return fixture.shadow.loadShadowSyncMeta('pts:last');
  });
  expect(cursor.pts).toBe('10000');
});

test('тысячи пропущенных событий заменяются снимком, PTS не продвигается до успешного GET', async ({
  page
}) => {
  await openFixture(page);
  let releaseDelta!: () => void;
  const deltaGate = new Promise<void>(resolve => {
    releaseDelta = resolve;
  });
  let deltaRequests = 0;
  await page.route('**/performance-api/topics/sync?*', async route => {
    deltaRequests++;
    await deltaGate;
    return route.fulfill({
      json: {
        reset: false,
        sync: { version: 1, pts: '20', syncedAt: new Date().toISOString() },
        topicIds: ['performance-0'],
        activeCalls: [],
        unreadTopics: [],
        data: [{ id: 'performance-0', type: 'DM', name: 'Запоздалая дельта' }]
      }
    });
  });
  await page.evaluate(async () => {
    const fixture = (window as any).topicPerformance;
    const cache = await import('/src/services/useChatStateCache.ts');
    await cache.saveCachedTopicSyncSnapshot(
      fixture.topics,
      {
        version: 1,
        pts: '10',
        syncedAt: new Date().toISOString()
      },
      'performance-user'
    );
    const topics = await import('/src/composables/useTopics.ts');
    (window as any).oldTopicsRefresh = topics.fetchAllTopics();
  });
  await expect.poll(() => deltaRequests).toBe(1);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let fullRequests = 0;
  await page.route('**/performance-api/topics?*', async route => {
    fullRequests++;
    await gate;
    return route.fulfill({
      json: {
        data: [{ id: 'performance-0', name: 'Свежий список', type: 'DM' }],
        unreadTopics: [],
        sync: { version: 1, pts: '10000', syncedAt: new Date().toISOString() },
        meta: { totalItems: 1, currentPage: 1, totalPages: 1 }
      }
    });
  });
  try {
    await page.evaluate(() => {
      const fixture = (window as any).topicPerformance;
      const put = IDBObjectStore.prototype.put;
      (window as any).ptsCursorWrites = 0;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'syncMeta' && args[0]?.key?.endsWith(':pts:last'))
          (window as any).ptsCursorWrites++;
        return put.apply(this, args);
      };
      const sent: unknown[] = [];
      (window as any).ptsRecoverySent = sent;
      fixture.sdk.sendWebSocketEvent = (type: string, payload: unknown) => {
        if (type === 'syncState') sent.push(payload);
        return true;
      };
      for (let page = 0; page < 6; page++) {
        const from = 10 + page * 200;
        fixture.emitChatEvent({
          type: 'syncReplay',
          payload: {
            fromPts: String(from),
            toPts: String(from + 200),
            hasMore: true,
            events: Array.from({ length: 200 }, (_, index) => ({
              eventId: `replay-${from + index}`,
              pts: String(from + index + 1),
              topicId: 'performance-0',
              eventType: 'test.unknown',
              payload: {}
            }))
          }
        });
      }
    });
    await expect.poll(() => fullRequests).toBe(1);
    expect(
      await page.evaluate(
        async () =>
          (
            await (window as any).topicPerformance.shadow.loadShadowSyncMeta(
              'pts:last'
            )
          ).pts
      )
    ).toBe('810');
    expect(await page.evaluate(() => (window as any).ptsRecoverySent)).toEqual([
      { pts: '210' },
      { pts: '410' },
      { pts: '610' },
      { pts: '810' }
    ]);
  } finally {
    release();
    releaseDelta();
  }
  await expect
    .poll(() => page.evaluate(() => (window as any).ptsRecoverySent))
    .toEqual([
      { pts: '210' },
      { pts: '410' },
      { pts: '610' },
      { pts: '810' },
      { pts: '10000' }
    ]);
  expect(fullRequests).toBe(1);
  const cursorWrites = await page.evaluate(
    () => (window as any).ptsCursorWrites
  );
  expect(cursorWrites).toBeGreaterThan(0);
  expect(cursorWrites).toBeLessThanOrEqual(10);
  await page.evaluate(() => (window as any).oldTopicsRefresh);
  expect(
    await page.evaluate(
      () =>
        (window as any).topicPerformance.getSelectedTopic('performance-0').name
    )
  ).toBe('Свежий список');
});
