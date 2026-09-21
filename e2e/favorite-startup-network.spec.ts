import { expect, test, type Page } from '@playwright/test';
import { makeMessages, openFixture } from './fixtures/topic-performance-page';

const favoriteId = 'performance-favorite';
const favorite = {
  id: favoriteId,
  type: 'GROUP',
  isFavorite: true,
  members: [{ id: 'performance-user' }],
  info: { isPin: true },
  group: { title: 'Избранное', description: 'sep-chat:favorite-messages:v1' }
};

async function prepareFavorite(page: Page, connected = true) {
  const state = await openFixture(page);
  await page.route('**/performance-api/topics?*', route =>
    route.fulfill({ json: { data: [favorite] } })
  );
  await page.evaluate(
    async ({ favorite, connected }) => {
      const fixturePath = '/e2e/fixtures/network-harness.ts';
      const { topics } = await import(/* @vite-ignore */ fixturePath);
      (window as any).favoriteTopics = topics;
      topics.setTopics([favorite as any]);
      if (!(window as any).topicPerformance.getSelectedTopic(favorite.id))
        throw new Error('Избранное должно быть в общем хранилище топиков');
      const control = { connected, deletes: [] as string[] };
      (window as any).favoriteConnection = control;
      const sdk = (window as any).topicPerformance.sdk;
      sdk.isConnected = () => control.connected;
      sdk.sendWebSocketEvent = (event: string, data: any) => {
        if (data?.messageId) control.deletes.push(data.messageId);
        return true;
      };
    },
    { favorite, connected }
  );
  return state;
}

test('100 обновлений списка не загружают историю закрытого Избранного', async ({
  page
}) => {
  const state = await prepareFavorite(page);
  const history: string[] = [];
  const topicRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/messages/')) history.push(request.url());
    if (request.url().includes('/performance-api/topics?'))
      topicRequests.push(request.url());
  });
  await page.evaluate(async () => {
    await Promise.all(
      Array.from({ length: 100 }, () =>
        (window as any).favoriteTopics.fetchAllTopics()
      )
    );
  });
  await page.waitForTimeout(400);
  expect(history).toEqual([]);
  expect(topicRequests).toHaveLength(1);
  expect(
    await page.evaluate(() => (window as any).favoriteConnection.deletes)
  ).toEqual([]);
  expect(state.errors).toEqual([]);
});

test('очистка использует загруженную страницу и не повторяет удаление при параллельном чтении', async ({
  page
}) => {
  const state = await prepareFavorite(page);
  const rows = makeMessages(favoriteId, 2).map((row, index) => ({
    ...row,
    isSystem: index === 0
  }));
  const history: string[] = [];
  await page.route(
    `**/performance-api/messages/topic/${favoriteId}?*`,
    route => {
      history.push(route.request().url());
      return route.fulfill({ json: rows });
    }
  );
  await page.evaluate(async id => {
    const messages = (window as any).topicPerformance.messages;
    await Promise.all(
      Array.from({ length: 20 }, () =>
        messages.fetchMessagesForTopic(id, {
          limit: 20,
          forceNetwork: true,
          forceRefresh: true
        })
      )
    );
  }, favoriteId);
  expect(history).toHaveLength(1);
  expect(
    await page.evaluate(() => (window as any).favoriteConnection.deletes)
  ).toEqual([rows[0].id]);
  expect(
    await page.evaluate(
      id =>
        (window as any).topicPerformance.messages
          .getFullMessagesByTopicId(id)
          .map((row: any) => row.id),
      favoriteId
    )
  ).toEqual([rows[1].id]);
  expect(state.errors).toEqual([]);
});

test('ожидание соединения не задерживает историю и не пропускает системные сообщения следующих страниц', async ({
  page
}) => {
  const state = await prepareFavorite(page, false);
  const rows = makeMessages(favoriteId, 4).map((row, index) => ({
    ...row,
    isSystem: index % 2 === 0
  }));
  let historyRequests = 0;
  await page.route(
    `**/performance-api/messages/topic/${favoriteId}?*`,
    route => {
      historyRequests++;
      const older = new URL(route.request().url()).searchParams.has(
        'lastMessageId'
      );
      return route.fulfill({ json: older ? rows.slice(0, 2) : rows.slice(2) });
    }
  );
  await page.evaluate(async id => {
    const messages = (window as any).topicPerformance.messages;
    await messages.fetchMessagesForTopic(id, { limit: 2, forceNetwork: true });
    await messages.fetchMessagesForTopic(id, {
      limit: 2,
      lastMessageId: `${id}-message-2`,
      forceNetwork: true
    });
  }, favoriteId);
  expect(historyRequests).toBe(2);
  expect(
    await page.evaluate(() => (window as any).favoriteConnection.deletes)
  ).toEqual([]);
  await page.evaluate(() => {
    (window as any).favoriteConnection.connected = true;
  });
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).favoriteConnection.deletes.sort())
    )
    .toEqual([rows[0].id, rows[2].id]);
  expect(historyRequests).toBe(2);
  expect(state.errors).toEqual([]);
});

test('очистка старой сессии отменяется при смене SDK', async ({ page }) => {
  const state = await prepareFavorite(page, false);
  const rows = makeMessages(favoriteId, 1).map(row => ({
    ...row,
    isSystem: true
  }));
  await page.route(`**/performance-api/messages/topic/${favoriteId}?*`, route =>
    route.fulfill({ json: rows })
  );
  await page.evaluate(async id => {
    await (window as any).topicPerformance.messages.fetchMessagesForTopic(id, {
      limit: 1,
      forceNetwork: true
    });
    const fixturePath = '/e2e/fixtures/network-harness.ts';
    const chat = await import(/* @vite-ignore */ fixturePath);
    await chat.initializeChat({
      userId: 'replacement-user',
      token: 'isolated-replacement-session',
      apiUrl: `${location.origin}/performance-api`,
      wsUrl: 'ws://127.0.0.1:65530'
    });
    (window as any).favoriteConnection.connected = true;
  }, favoriteId);
  await page.waitForTimeout(350);
  expect(
    await page.evaluate(() => (window as any).favoriteConnection.deletes)
  ).toEqual([]);
  expect(state.errors).toEqual([]);
});

test('системные сообщения обычной группы сохраняются', async ({ page }) => {
  const state = await prepareFavorite(page);
  await page.evaluate(favorite => {
    (window as any).favoriteTopics.setTopics([
      { ...favorite, isFavorite: false, group: { title: 'Обычная группа' } }
    ]);
  }, favorite);
  const rows = makeMessages(favoriteId, 2).map((row, index) => ({
    ...row,
    isSystem: index === 0
  }));
  await page.route(`**/performance-api/messages/topic/${favoriteId}?*`, route =>
    route.fulfill({ json: rows })
  );
  await page.evaluate(async id => {
    await (window as any).topicPerformance.messages.fetchMessagesForTopic(id, {
      limit: 2,
      forceNetwork: true
    });
  }, favoriteId);
  expect(
    await page.evaluate(() => (window as any).favoriteConnection.deletes)
  ).toEqual([]);
  expect(
    await page.evaluate(
      id =>
        (window as any).topicPerformance.messages.getFullMessagesByTopicId(id)
          .length,
      favoriteId
    )
  ).toBe(2);
  expect(state.errors).toEqual([]);
});
