import { expect, test, type Page } from '@playwright/test';
import { createAndroidPerformanceServer } from './fixtures/android-performance-server';

test.setTimeout(60_000);
let fixture: Awaited<ReturnType<typeof createAndroidPerformanceServer>>;
// eslint-disable-next-line no-empty-pattern
test.beforeAll(async ({}, workerInfo) => {
  fixture = await createAndroidPerformanceServer({
    port: 5340 + workerInfo.workerIndex,
    topicCount: 8,
    userCount: 20,
    messagesPerTopic: 2
  });
});
test.afterAll(async () => fixture.close());

const syncState = (pts: string) => ({
  version: 1,
  pts,
  syncedAt: new Date().toISOString()
});

async function prepare(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route =>
    ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort()
  );
  await page.routeWebSocket('**/socket.io/**', socket => socket.close());
  await page.addInitScript(
    ({ origin, config, user, topicId }) => {
      localStorage.setItem(
        'chat_auth_session',
        JSON.stringify({ token: 'topic-sync-fixture', user })
      );
      localStorage.setItem(
        'chat_runtime_organizations',
        JSON.stringify([{ url: origin, config }])
      );
      localStorage.setItem('chat_runtime_last_organization', origin);
      localStorage.setItem(
        'chat.indexeddb.reset.done',
        'chat-client-indexeddb-reset-2026-04-29-v1'
      );
      (window as any).__firstSyncedFrame = null;
      const capture = () => {
        const row = document.querySelector<HTMLElement>(
          `[data-topic-id="${topicId}"]`
        );
        if (
          row &&
          !document.getElementById('startup-shell') &&
          row.getBoundingClientRect().height > 0
        )
          (window as any).__firstSyncedFrame = row.innerText;
        else requestAnimationFrame(capture);
      };
      requestAnimationFrame(capture);
    },
    {
      origin: fixture.origin,
      config: fixture.config,
      user: fixture.user,
      topicId: fixture.topics[1].id
    }
  );
  return errors;
}

async function readSnapshot(page: Page) {
  return page.evaluate(
    userId =>
      new Promise<any>((resolve, reject) => {
        const open = indexedDB.open('chat-offline-state-db');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('entities', 'readonly');
          const request = tx
            .objectStore('entities')
            .get(`${userId}:topics-sync`);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => reject(request.error);
          tx.oncomplete = () => db.close();
        };
      }),
    fixture.user.id
  );
}

async function bootstrap(page: Page) {
  let fullRequests = 0;
  await page.route('**/api/topics?*', route => {
    fullRequests++;
    return route.fulfill({
      json: {
        data: fixture.topics,
        unreadTopics: [],
        sync: syncState('10'),
        meta: { totalItems: 8, totalPages: 1, currentPage: 1 }
      }
    });
  });
  await page.goto('/');
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 20_000
  });
  await expect(page.locator('[data-topic-id]')).toHaveCount(8);
  await expect
    .poll(async () => (await readSnapshot(page))?.topicSync?.pts)
    .toBe('10');
  await expect
    .poll(() =>
      page.evaluate(
        ({ origin, userId }) =>
          Number(
            localStorage.getItem(
              `chat-topic-preview-v1:${origin}/api:${userId}`
            )
          ),
        { origin: fixture.origin, userId: fixture.user.id }
      )
    )
    .toBeGreaterThan(0);
  return () => fullRequests;
}

test('повторный запуск применяет дельту из IndexedDB, добавления и удаления без полного GET', async ({
  page,
  isMobile
}) => {
  const errors = await prepare(page);
  const fullRequests = await bootstrap(page);
  const updated = {
    ...fixture.topics[1],
    info: { ...fixture.topics[1].info, isPin: true, isMute: true },
    hasUnreadReaction: true,
    unreadReactionMessageId: fixture.topics[1].lastMessage.id,
    lastMessage: {
      ...fixture.topics[1].lastMessage,
      text: 'Актуально после PTS',
      updatedAt: new Date().toISOString()
    }
  };
  const added = {
    ...fixture.topics[2],
    id: '29400000-0000-4000-8000-999999999999',
    name: 'Новый чат PTS'
  };
  const ids = [...fixture.topics.slice(0, -1).map(topic => topic.id), added.id];
  const cursors: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/api/topics/sync?*', async route => {
    cursors.push(new URL(route.request().url()).searchParams.get('pts')!);
    await gate;
    await route.fulfill({
      json: {
        reset: false,
        sync: syncState('20'),
        topicIds: ids,
        data: cursors.length === 1 ? [updated, added] : [],
        activeCalls: [],
        unreadTopics: []
      }
    });
  });
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => cursors.length, { timeout: 15000 }).toBe(1);
    if (isMobile) {
      await expect(page.locator('#startup-shell')).toHaveCount(0);
      await expect
        .poll(() => page.evaluate(() => (window as any).__firstSyncedFrame))
        .toContain(fixture.topics[1].lastMessage.text);
    } else {
      await expect(page.locator('#startup-shell')).toHaveCount(1);
      expect(
        await page.evaluate(() => (window as any).__firstSyncedFrame)
      ).toBeNull();
    }
  } finally {
    release();
  }
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 15_000
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).__firstSyncedFrame))
    .toContain(
      isMobile ? fixture.topics[1].lastMessage.text : 'Актуально после PTS'
    );
  await expect(page.locator(`[data-topic-id="${updated.id}"]`)).toContainText(
    'Актуально после PTS'
  );
  await expect(
    page.locator(`[data-topic-id="${fixture.topics.at(-1)!.id}"]`)
  ).toHaveCount(0);
  await expect(page.locator(`[data-topic-id="${added.id}"]`)).toHaveCount(1);
  const snapshot = await readSnapshot(page);
  expect(snapshot.topicSync.pts).toBe('20');
  expect(
    snapshot.items.find((topic: any) => topic.id === updated.id)
  ).toMatchObject({
    info: { isPin: true, isMute: true },
    hasUnreadReaction: true
  });
  expect(
    await page.evaluate(
      async ({ topics, userId, topicId }) => {
        const moduleUrl = performance
          .getEntriesByType('resource')
          .find(entry =>
            /\/src\/composables\/useTopics\.ts(?:\?|$)/.test(entry.name)
          )!.name;
        const api = await import(moduleUrl);
        const before = api.getSelectedTopic(topicId)?.info?.isPin;
        api.applyNativeTopicSnapshot(
          topics as any,
          userId,
          new Date(Date.now() - 60_000).toISOString()
        );
        return { before, after: api.getSelectedTopic(topicId)?.info?.isPin };
      },
      { topics: fixture.topics, userId: fixture.user.id, topicId: updated.id }
    )
  ).toEqual({ before: true, after: true });
  await expect(page.locator(`[data-topic-id="${added.id}"]`)).toHaveCount(1);
  // Имитируем позднюю запись обычного кеша из другой вкладки.
  await page.evaluate(
    async ({ topics, userId }) => {
      const cache = await import('/src/services/useChatStateCache.ts');
      await cache.saveCachedTopics(topics as any, userId);
    },
    { topics: fixture.topics, userId: fixture.user.id }
  );
  await page.reload();
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 15_000
  });
  await expect(page.locator(`[data-topic-id="${updated.id}"]`)).toContainText(
    'Актуально после PTS'
  );
  expect(
    (await readSnapshot(page)).items.find(
      (topic: any) => topic.id === updated.id
    ).hasUnreadReaction
  ).toBe(true);
  expect(cursors).toEqual(['10', '20']);
  expect(fullRequests()).toBe(1);
  expect(errors).toEqual([]);
});

test('месячный снимок сразу обновляется через GetTopics без запроса дельты', async ({
  page
}) => {
  const errors = await prepare(page);
  const fullRequests = await bootstrap(page);
  await page.evaluate(
    ({ origin, userId }) =>
      localStorage.setItem(
        `chat-topic-preview-v1:${origin}/api:${userId}`,
        String(Date.now() - 31 * 86400_000)
      ),
    { origin: fixture.origin, userId: fixture.user.id }
  );
  await page.evaluate(
    userId =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('chat-offline-state-db');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('entities', 'readwrite');
          const store = tx.objectStore('entities');
          const request = store.get(`${userId}:topics-sync`);
          request.onsuccess = () => {
            const record = request.result;
            record.topicSync.syncedAt = new Date(
              Date.now() - 31 * 86400_000
            ).toISOString();
            store.put(record);
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    fixture.user.id
  );
  let deltas = 0;
  await page.route('**/api/topics/sync?*', route => {
    deltas++;
    return route.fulfill({ json: { reset: true } });
  });
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let full = 0;
  let histories = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/messages/topic/'))
      histories++;
  });
  const current = Array.from({ length: 50 }, (_, i) => ({
    ...fixture.topics[1],
    id: i ? `month-new-${i}` : fixture.topics[1].id,
    unreadMessageCount: 50000,
    lastMessage: {
      ...fixture.topics[1].lastMessage,
      text: 'Актуально после месяца',
      updatedAt: new Date().toISOString()
    }
  }));
  await page.route('**/api/topics?*', async route => {
    full++;
    await gate;
    await route.fulfill({
      json: {
        data: current,
        unreadTopics: [],
        sync: syncState('90000'),
        meta: { totalItems: 120, totalPages: 3, currentPage: 1 }
      }
    });
  });
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => full).toBe(1);
    await expect(page.locator('#startup-shell')).toHaveCount(1);
    expect(
      await page.evaluate(() => (window as any).__firstSyncedFrame)
    ).toBeNull();
  } finally {
    release();
  }
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 20_000
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).__firstSyncedFrame))
    .toContain('Актуально после месяца');
  await expect(
    page.locator(`[data-topic-id="${fixture.topics.at(-1)!.id}"]`)
  ).toHaveCount(0);
  expect(fullRequests()).toBe(1);
  expect(histories).toBe(0);
  expect(deltas).toBe(0);
  expect(errors).toEqual([]);
});

for (const fallback of [
  'reset',
  'missing-card',
  'unsupported-version'
] as const) {
  test(`новый снимок при ${fallback}`, async ({ page }) => {
    const errors = await prepare(page);
    const fullRequests = await bootstrap(page);
    let deltas = 0;
    await page.route('**/api/topics/sync?*', route => {
      deltas++;
      return route.fulfill({
        json:
          fallback === 'reset'
            ? { reset: true }
            : {
                reset: false,
                sync: {
                  ...syncState('20'),
                  version: fallback === 'unsupported-version' ? 2 : 1
                },
                topicIds: [
                  ...fixture.topics.map(topic => topic.id),
                  'missing-card'
                ],
                data: [],
                activeCalls: [],
                unreadTopics: []
              }
      });
    });
    await page.reload();
    await expect(page.locator('#startup-shell')).toHaveCount(0, {
      timeout: 15_000
    });
    await expect(page.locator('[data-topic-id]')).toHaveCount(8);
    expect(deltas).toBe(1);
    expect(fullRequests()).toBe(2);
    expect(errors).toEqual([]);
  });
}

test('при ошибке дельты и полного запроса открывает кеш и сообщает о сбое', async ({
  page
}) => {
  const errors = await prepare(page);
  await bootstrap(page);
  await page.route('**/api/topics/sync?*', route =>
    route.fulfill({ status: 503, json: {} })
  );
  await page.route('**/api/topics?*', route =>
    route.fulfill({ status: 503, json: {} })
  );
  await page.reload();
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 15_000
  });
  await expect(page.locator('[data-topic-id]')).toHaveCount(8);
  await expect(page.locator('.connection-status:visible')).toContainText(
    'Не удалось обновить',
    { timeout: 10_000 }
  );
  expect((await readSnapshot(page)).topicSync.pts).toBe('10');
  expect(errors).toEqual([]);
});

test('без сети показывает последние локальные данные поверх более старого подтверждённого снимка', async ({
  page
}) => {
  const errors = await prepare(page);
  await bootstrap(page);
  await page.evaluate(
    async ({ topics, userId }) => {
      const cache = await import('/src/services/useChatStateCache.ts');
      await cache.saveCachedTopics(topics as any, userId);
    },
    {
      topics: fixture.topics.map(topic => ({
        ...topic,
        lastMessage: {
          ...topic.lastMessage,
          text: 'Новее подтверждённого снимка'
        }
      })),
      userId: fixture.user.id
    }
  );
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false
    })
  );
  await page.route(`${fixture.origin}/**`, route => route.abort());
  await page.reload();
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 15_000
  });
  await expect(
    page.locator(`[data-topic-id="${fixture.topics[1].id}"]`)
  ).toContainText('Новее подтверждённого снимка');
  expect((await readSnapshot(page)).topicSync.pts).toBe('10');
  expect(errors).toEqual([]);
});

test('на телефоне прямая ссылка ждёт сверки списка перед снятием скелетона', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Проверка мобильного старта');
  const errors = await prepare(page);
  const fullRequests = await bootstrap(page);
  let markRouteEntered!: () => void;
  const routeEntered = new Promise<void>(resolve => {
    markRouteEntered = resolve;
  });
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/api/topics/sync?*', async route => {
    markRouteEntered();
    await gate;
    await route.fulfill({
      json: {
        reset: false,
        sync: syncState('20'),
        topicIds: fixture.topics.map(topic => topic.id),
        data: [],
        activeCalls: [],
        unreadTopics: []
      }
    });
  });
  try {
    const syncRequested = page.waitForRequest(
      request => new URL(request.url()).pathname === '/api/topics/sync',
      { timeout: 15_000 }
    );
    await page.goto(`/dialogs/${fixture.topics[1].id}`, {
      waitUntil: 'commit'
    });
    await syncRequested;
    await routeEntered;
    await expect(page.locator('#startup-shell')).toHaveCount(1);
    expect(
      await page.evaluate(
        () => performance.getEntriesByName('chat-startup:content-ready').length
      )
    ).toBe(0);
  } finally {
    release();
  }
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 15_000
  });
  expect(
    await page.evaluate(() => {
      const fresh = performance
        .getEntriesByName('chat-startup:topics-resolved')
        .at(-1) as PerformanceMark;
      const ready = performance
        .getEntriesByName('chat-startup:content-ready')
        .at(-1)!;
      return fresh.detail?.isFresh && fresh.startTime <= ready.startTime;
    })
  ).toBe(true);
  expect(fullRequests()).toBe(1);
  expect(errors).toEqual([]);
});

test('неполный снимок не подтверждает курсор до загрузки остальных страниц', async ({
  page
}) => {
  const errors = await prepare(page);
  let fullRequests = 0;
  let deltas = 0;
  await page.route('**/api/topics/sync?*', route => {
    deltas++;
    return route.fulfill({ json: { reset: true } });
  });
  await page.route('**/api/topics?*', route => {
    if (new URL(route.request().url()).searchParams.get('page') !== '1')
      return route.fulfill({
        status: 503,
        json: { message: 'Страница недоступна' }
      });
    fullRequests++;
    return route.fulfill({
      json: {
        data: Array.from({ length: 50 }, (_, index) => ({
          ...fixture.topics[index % 8],
          id: `partial-${index}`
        })),
        unreadTopics: [],
        sync: syncState('10'),
        meta: { totalItems: 120, totalPages: 3, currentPage: 1 }
      }
    });
  });
  await page.goto('/');
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 20_000
  });
  expect((await readSnapshot(page))?.topicSync).toBeUndefined();
  await page.reload();
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 15_000
  });
  expect(fullRequests).toBe(2);
  expect(deltas).toBe(0);
  expect(errors).toEqual([]);
});
