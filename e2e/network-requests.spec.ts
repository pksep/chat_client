import { expect, test, type Page } from '@playwright/test';
import {
  makeMessages,
  openFixture,
  openTopic,
  message
} from './fixtures/topic-performance-page';

test.setTimeout(90_000);

const mountUpdates = (page: Page) =>
  page.evaluate(async () => {
    const path = '/e2e/fixtures/network-harness.ts';
    const fixture = await import(/* @vite-ignore */ path);
    (window as any).networkUpdates = fixture.mountUpdates();
  });

const setVisibility = (page: Page, state: 'hidden' | 'visible') =>
  page.evaluate(state => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: state
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);

async function prepareConnection(page: Page, count = 20) {
  if (process.env.NETWORK_DEBUG)
    page.on('console', event => console.log(event.type(), event.text()));
  if (process.env.NETWORK_DEBUG)
    page.on('request', request => {
      if (request.url().includes('/performance-api/'))
        console.log('HTTP', request.method(), request.url());
    });
  const state = await openFixture(page, { count, backgroundSync: true });
  await page.route('**/performance-api/topics?*', async route => {
    const topics = await page.evaluate(
      () => (window as any).topicPerformance.topics
    );
    await route.fulfill({
      json: {
        data: [
          ...topics.map((topic: any) => ({
            ...topic,
            lastMessage:
              topic.id === 'performance-0' && count === 0
                ? undefined
                : makeMessages(topic.id, 20).at(-1)
          })),
          {
            id: 'favorite',
            type: 'DM',
            isFavorite: true,
            info: { unreadCount: 0 }
          }
        ]
      }
    });
  });
  await page.route('**/performance-api/users?*', route =>
    route.fulfill({ json: { data: [] } })
  );
  await page.evaluate(async () => {
    const path = '/e2e/fixtures/network-harness.ts';
    const fixture = await import(/* @vite-ignore */ path);
    (window as any).networkConnection = fixture.controlConnection();
    await fixture.fetchAllTopics();
  });
  await page.waitForTimeout(400);
  return state;
}

test('100 событий focus при живом соединении не обновляют HTTP-данные', async ({
  page
}) => {
  const requests: string[] = [];
  await prepareConnection(page);
  page.on('request', request => {
    if (request.url().includes('/performance-api/'))
      requests.push(request.url());
  });
  await page.evaluate(() => {
    for (let index = 0; index < 100; index++)
      window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(1200);
  expect(requests).toEqual([]);
  expect(
    await page.evaluate(
      () => (window as any).networkConnection.calls.disconnect
    )
  ).toBe(0);
});

test('короткое скрытие вкладки сохраняет соединение и не запускает вторую синхронизацию', async ({
  page
}) => {
  await page.clock.install();
  await prepareConnection(page);
  await page.clock.pauseAt(Date.now() + 1000);
  const requests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/performance-api/'))
      requests.push(request.url());
  });
  await setVisibility(page, 'hidden');
  await page.clock.runFor(1000);
  await setVisibility(page, 'visible');
  await page.clock.fastForward(35_000);
  await page.waitForTimeout(500);
  expect(requests).toEqual([]);
  expect(
    await page.evaluate(
      () => (window as any).networkConnection.calls.disconnect
    )
  ).toBe(0);
});

test('возврат после разрыва загружает пустую историю один раз и не прогревает неоткрытые топики', async ({
  page
}) => {
  const state = await prepareConnection(page, 0);
  await openTopic(page, 0);
  await expect(
    page.getByTestId('Performance-MessageList-EmptyChat')
  ).toBeVisible();
  const historyRequests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (/\/messages\/topic\/[^/]+$/.test(url.pathname))
      historyRequests.push(url.pathname + url.search);
  });
  await page.evaluate(() => {
    (window as any).networkConnection.loseConnection();
    window.dispatchEvent(new Event('focus'));
  });
  await expect.poll(() => historyRequests.length).toBeGreaterThan(0);
  await page.waitForTimeout(1800);
  expect(historyRequests).toEqual([
    '/performance-api/messages/topic/performance-0?limit=100&newMessages=true'
  ]);
  expect(state.errors).toEqual([]);
});

for (const blocked of ['users', 'topics']) {
  test(`восстановление открытого чата не ждёт медленный ${blocked}`, async ({
    page
  }) => {
    const state = await prepareConnection(page);
    await openTopic(page, 0);
    await expect(message(page, 0)).toBeVisible();
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    let bulkRequests = 0;
    let historyRequests = 0;
    await page.route(`**/performance-api/${blocked}?*`, async route => {
      if (new URL(route.request().url()).searchParams.has('_'))
        return route.fallback();
      bulkRequests++;
      await gate;
      await route.fallback();
    });
    await page.route(
      '**/performance-api/messages/topic/performance-0?*',
      async route => {
        historyRequests++;
        await route.fulfill({ json: makeMessages('performance-0', 21) });
      }
    );
    try {
      await page.evaluate(() => {
        (window as any).networkConnection.loseConnection();
        window.dispatchEvent(new Event('focus'));
      });
      await expect.poll(() => bulkRequests).toBe(1);
      // Свежая история должна появиться, пока фоновый HTTP ещё заблокирован.
      await expect(message(page, 0, 20)).toBeVisible({ timeout: 3000 });
      expect(historyRequests).toBe(1);
    } finally {
      release();
    }
    await page.waitForTimeout(1000);
    expect(historyRequests).toBe(1);
    await expect(message(page, 0, 20)).toBeVisible();
    expect(state.errors).toEqual([]);
  });
}

test('поздняя история восстановления не подменяет чат после перехода', async ({
  page
}) => {
  const state = await prepareConnection(page);
  await openTopic(page, 0);
  await expect(message(page, 0)).toBeVisible();
  let releaseHistory!: () => void;
  let releaseUsers!: () => void;
  const historyGate = new Promise<void>(resolve => (releaseHistory = resolve));
  const usersGate = new Promise<void>(resolve => (releaseUsers = resolve));
  let historyRequests = 0;
  await page.route('**/performance-api/users?*', async route => {
    await usersGate;
    await route.fallback();
  });
  await page.route(
    '**/performance-api/messages/topic/performance-0?*',
    async route => {
      historyRequests++;
      await historyGate;
      await route.fulfill({ json: makeMessages('performance-0', 21) });
    }
  );
  try {
    await page.evaluate(() => {
      (window as any).networkConnection.loseConnection();
      window.dispatchEvent(new Event('focus'));
    });
    await expect.poll(() => historyRequests).toBe(1);
    await openTopic(page, 1);
    await expect(message(page, 1)).toBeVisible();
    releaseHistory();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as any).topicPerformance.messages
              .getFullMessagesByTopicId('performance-0')
              .at(-1)?.id
        )
      )
      .toBe('performance-0-message-20');
    await expect(message(page, 0, 20)).toHaveCount(0);
    await expect(message(page, 1)).toBeVisible();
    expect(historyRequests).toBe(1);
  } finally {
    releaseHistory();
    releaseUsers();
  }
  expect(state.errors).toEqual([]);
});

test('700 одновременных чтений справочников и контекста дают 7 HTTP', async ({
  page
}) => {
  const state = await openFixture(page, { delay: 100 });
  await page.evaluate(async () => {
    const { sdk } = (window as any).topicPerformance;
    await Promise.all(
      Array.from({ length: 100 }, () =>
        Promise.all([
          sdk.getTopics(),
          sdk.getUsers({ search: 'тест', page: 1, limit: 50 }),
          sdk.getUserProfile('performance-user'),
          sdk.getAroundMessage('performance-0-message-0'),
          sdk.getTopicMedia('performance-0', { limit: 50 }),
          sdk.getTopicFiles('performance-0', { limit: 50 }),
          sdk.searchMessages('тест', { topicId: 'performance-0', page: 1 })
        ])
      )
    );
  });
  expect(state.requests.filter(url => url.startsWith('GET '))).toHaveLength(7);
  expect(state.errors).toEqual([]);
  expect(state.failures).toEqual([]);
});

test('контекст закрепа готовится заранее и повторно используется при нажатии', async ({
  page
}) => {
  const state = await openFixture(page, {
    count: 400,
    shell: true,
    pinOutsideHistory: true
  });
  await openTopic(page, 0);
  await expect(message(page, 0, 399)).toBeVisible();
  const pin = page.getByTestId('Pinned-Messages');
  await expect(pin).toBeVisible();
  await page.waitForTimeout(800);
  expect(state.requests.filter(url => url.includes('/around'))).toHaveLength(1);
  await pin.click();
  await expect(message(page, 0, 0)).toBeVisible();
  await expect
    .poll(() => state.requests.filter(url => url.includes('/around')).length)
    .toBe(1);
  expect(state.errors).toEqual([]);
});

test('проверка обновления объединяет 100 одновременных обращений', async ({
  page
}) => {
  await openFixture(page);
  let checks = 0;
  await page.route('**/web-update.json*', async route => {
    checks++;
    await new Promise(resolve => setTimeout(resolve, 200));
    await route.fulfill({ json: { version: 1 } });
  });
  await mountUpdates(page);
  await page.evaluate(async () => {
    const { updates } = (window as any).networkUpdates;
    await Promise.all(
      Array.from({ length: 100 }, () => updates.checkForUpdates())
    );
  });
  expect(checks).toBe(1);
});

test('долгое отсутствие обновляет активную и устаревшую резидентную историю', async ({
  page
}) => {
  await page.clock.install();
  const state = await prepareConnection(page);
  // Сначала завершаем начальное HTTP-окно мобильного чата, затем добавляем
  // резидентную историю: проверяем reconnect, а не замену стартового preview.
  await openTopic(page, 0);
  await expect(message(page, 0)).toBeVisible();
  for (const index of [0, 1]) {
    const topicId = `performance-${index}`;
    const older = makeMessages(topicId, 300).map((row, index) => ({
      ...row,
      id: `${topicId}-older-${index}`,
      createdAt: new Date(Date.UTC(2025, 0, 1, 0, 0, index)).toISOString()
    }));
    await page.evaluate(
      ({ topicId, rows }) =>
        (window as any).topicPerformance.seed(topicId, rows),
      {
        topicId,
        rows: [...older, ...makeMessages(topicId, 5)]
      }
    );
  }
  expect(
    await page.evaluate(() =>
      [0, 1].map(
        index =>
          (window as any).topicPerformance.messages.getFullMessagesByTopicId(
            `performance-${index}`
          ).length
      )
    )
  ).toEqual([305, 305]);
  await page.clock.pauseAt(Date.now() + 1000);
  const histories: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (/\/messages\/topic\/[^/]+$/.test(url.pathname))
      histories.push(url.pathname);
  });
  await setVisibility(page, 'hidden');
  await page.clock.fastForward(65_000);
  expect(histories).toEqual([]);
  await setVisibility(page, 'visible');
  // Разрешаем поэтапное восстановление после возврата вкладки.
  await page.clock.resume();
  await expect
    .poll(() => histories)
    .toEqual([
      '/performance-api/messages/topic/performance-0',
      '/performance-api/messages/topic/performance-1'
    ]);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).topicPerformance.messages
            .getFullMessagesByTopicId('performance-1')
            .at(-1)?.id
      )
    )
    .toBe('performance-1-message-19');
  await page.waitForTimeout(500);
  expect(histories).toHaveLength(2);
  expect(
    await page.evaluate(() =>
      [0, 1].map(index => {
        const rows = (
          window as any
        ).topicPerformance.messages.getFullMessagesByTopicId(
          `performance-${index}`
        );
        return {
          count: rows.length,
          hasOlder: rows.some(
            (row: any) => row.id === `performance-${index}-older-0`
          )
        };
      })
    )
  ).toEqual([
    { count: 320, hasOlder: true },
    { count: 320, hasOlder: true }
  ]);
  expect(
    await page.evaluate(
      () => (window as any).networkConnection.calls.disconnect
    )
  ).toBe(0);
  expect(state.errors).toEqual([]);
});

test('при недоступном WebSocket отложенная фоновая синхронизация получает последние сообщения', async ({
  page
}) => {
  await page.clock.install();
  await prepareConnection(page);
  await openTopic(page, 0);
  await expect(message(page, 0)).toBeVisible();
  await page.waitForTimeout(1000);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = '/e2e/fixtures/network-harness.ts';
        const { getWebChatBackgroundSyncSnapshot } = await import(
          /* @vite-ignore */ path
        );
        return (await getWebChatBackgroundSyncSnapshot()).status?.state;
      })
    )
    .toBe('session_saved');
  const requests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/performance-api/'))
      requests.push(request.url());
  });
  await page.evaluate(() => {
    (window as any).networkConnection.loseConnection();
    (window as any).topicPerformance.sdk.reconnectIfNeeded = () => {};
  });
  await page.clock.pauseAt(Date.now() + 1000);
  await page.clock.fastForward(35_000);
  await expect
    .poll(() => requests.filter(url => url.includes('/sync/pts')).length)
    .toBe(1);
  await expect
    .poll(() => requests.filter(url => url.includes('/messages/topic/')).length)
    .toBe(1);
  expect(requests.find(url => url.includes('/messages/topic/'))).toContain(
    'newMessages=true'
  );
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = '/e2e/fixtures/network-harness.ts';
        const { getWebChatBackgroundSyncSnapshot } = await import(
          /* @vite-ignore */ path
        );
        const snapshot = await getWebChatBackgroundSyncSnapshot();
        return {
          state: snapshot.status?.state,
          last: snapshot.messagesByTopic?.['performance-0']?.at(-1)?.id
        };
      })
    )
    .toEqual({ state: 'completed', last: 'performance-0-message-19' });
});
